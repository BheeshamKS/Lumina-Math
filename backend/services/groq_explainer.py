"""
groq_explainer.py — Enriches SymPy solution steps with plain-English explanations.

Design:
  - One Groq call per solve (all steps in a single prompt).
  - Uses llama-3.1-8b-instant: fast, low-latency, good JSON compliance.
  - Hard 8-second timeout; any failure returns the original steps unchanged.
  - Explanations are merged back without touching any other step field.
"""

import os
import re
import json
import asyncio
import logging

from groq import AsyncGroq

logger = logging.getLogger(__name__)

_client: AsyncGroq | None = None


class ProofProblemError(ValueError):
    """Raised when a book problem is a proof/conceptual question, not a computable expression."""


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set")
        _client = AsyncGroq(api_key=api_key)
    return _client


async def explain_steps(problem: str, steps: list[dict], final_answer: str) -> list[dict]:
    """
    Return steps with an added 'explanation' field on each dict.
    Falls back to the original list on any error or timeout.
    """
    if not steps or not os.getenv("GROQ_API_KEY"):
        return steps

    try:
        return await asyncio.wait_for(
            _enrich(problem, steps, final_answer),
            timeout=8.0,
        )
    except Exception as exc:
        logger.warning("Groq explainer failed — returning raw steps: %s", exc)
        return steps


async def _enrich(problem: str, steps: list[dict], final_answer: str) -> list[dict]:
    client = _get_client()

    user_msg = (
        f"Problem: {problem}\n"
        f"Steps: {json.dumps(steps, ensure_ascii=False)}\n"
        f"Final answer: {final_answer}\n\n"
        "For each step, add an 'explanation' field: 1-2 plain English sentences "
        "explaining WHY this step is done and what it means mathematically. "
        "Be concise. Wrap all mathematical variables, equations, and expressions in single dollar signs for LaTeX rendering (e.g. $x^2 + 2x = 0$). "
        'Return JSON: {"steps": [<full step objects with explanation added>]}'
    )

    resp = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a concise math tutor. "
                    "Return ONLY valid JSON with a 'steps' key "
                    "containing the enriched array. No prose outside the JSON."
                ),
            },
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
        max_tokens=1200,
        temperature=0.25,
    )

    raw = resp.choices[0].message.content.strip()
    parsed = json.loads(raw)

    enriched: list = parsed.get("steps", [])

    # Validate: must be a list of the same length
    if not isinstance(enriched, list) or len(enriched) != len(steps):
        logger.warning(
            "Groq returned unexpected shape (got %d steps, expected %d) — falling back",
            len(enriched) if isinstance(enriched, list) else -1,
            len(steps),
        )
        return steps

    # Merge: keep every original field, only inject 'explanation'
    return [
        {**orig, "explanation": str(e.get("explanation", "")).strip()}
        for orig, e in zip(steps, enriched)
    ]


async def extract_problem_strict(user_message: str, chunks: list[dict]) -> dict[str, str]:
    """
    Extract a structured problem from book chunks using Groq.
    Returns {"expression": ..., "operation": ..., "variable": ...}.
    Raises ProofProblemError for proof/conceptual problems.
    Raises ValueError for other failures (timeout, missing API key, etc.).
    """
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("GROQ_API_KEY not configured")

    chunks_text = "\n".join(c.get("latex_content", "") for c in chunks[:5])

    try:
        result = await asyncio.wait_for(
            _extract_problem(user_message, chunks_text),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        raise ValueError("Groq extraction timed out")
    except Exception as exc:
        raise ValueError(str(exc))

    if result.get("operation") == "proof" or not result.get("expression", "").strip():
        raise ProofProblemError("proof_problem")

    return result


async def _extract_problem(user_message: str, chunks_text: str) -> dict[str, str]:
    client = _get_client()
    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a math extraction assistant working with textbook content.\n"
                    "Given the raw text of a specific textbook question and the user's request,\n"
                    "extract the mathematical problem.\n\n"
                    "Return ONLY a JSON object with:\n"
                    '- "expression": the matrix, equation, or expression to work with (raw notation, no LaTeX delimiters).\n'
                    "  For matrices use Python list notation: [[1,2],[3,4]]\n"
                    "  For equations use standard notation: x^2 - 5x + 6 = 0\n"
                    '- "operation": one of: "eigenvalues", "solve", "integrate", "differentiate",\n'
                    '  "factor", "simplify", "determinant", "inverse", "transpose", "limit"\n'
                    '- "variable": the main variable (default "x")\n\n'
                    "If the question is a proof or conceptual (not computationally solvable), return:\n"
                    '{"operation": "proof", "expression": "", "variable": ""}\n\n'
                    "CRITICAL: Use ONLY the question text provided. Never invent the problem.\n"
                    "For eigenvalue problems, always write the matrix in Python list notation,\n"
                    "e.g. [[4,0,1],[-2,1,0],[-2,0,1]]"
                ),
            },
            {
                "role": "user",
                "content": f"User request: {user_message}\n\nTextbook passage:\n{chunks_text}",
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=300,
        temperature=0.1,
    )
    raw = resp.choices[0].message.content.strip()
    # Some Groq model versions wrap JSON in markdown fences despite json_object mode
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"```\s*$", "", raw).strip()
    return json.loads(raw)


async def detect_plugins_from_book(sample_index: list[dict]) -> list[str]:
    """
    Analyze a sample of a book's index chunks and recommend which plugins to enable.
    Returns a list of plugin names.
    """
    if not sample_index or not os.getenv("GROQ_API_KEY"):
        return []

    try:
        return await asyncio.wait_for(_detect_domains(sample_index), timeout=8.0)
    except Exception as exc:
        logger.warning("Book plugin detection failed: %s", exc)
        return []


async def _detect_domains(sample_index: list[dict]) -> list[str]:
    client = _get_client()

    sample_text = json.dumps(sample_index[:10], ensure_ascii=False)
    prompt = (
        f"Book index sample: {sample_text}\n\n"
        "Which math domains appear in this textbook? "
        "Choose from: calculus, linear_algebra, statistics, trigonometry, number_theory, core. "
        'Return JSON: {"plugins": ["domain1", "domain2"]}'
    )

    resp = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": "You classify math textbooks by domain. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        max_tokens=128,
        temperature=0.1,
    )

    raw = resp.choices[0].message.content.strip()
    parsed = json.loads(raw)
    plugins: list = parsed.get("plugins", [])
    valid = {"calculus", "linear_algebra", "statistics", "trigonometry", "number_theory", "core"}
    return [p for p in plugins if p in valid]


async def explain_proof(user_message: str, chunks: list[dict]) -> dict:
    """
    For proof/conceptual problems, ask Groq to explain the approach step-by-step.
    Returns a SolutionData-compatible dict:
      { explanation, steps: [{description, explanation, expression?}], final_answer, tips? }
    Falls back to a minimal response on any error.
    """
    if not os.getenv("GROQ_API_KEY"):
        return _proof_fallback()

    chunks_text = "\n".join(c.get("latex_content", "") for c in chunks[:5])

    try:
        return await asyncio.wait_for(
            _run_proof_explanation(user_message, chunks_text),
            timeout=15.0,
        )
    except Exception as exc:
        logger.warning("Proof explanation failed: %s", exc)
        return _proof_fallback()


def _proof_fallback() -> dict:
    return {
        "explanation": "This is a proof or conceptual problem. Work through it using the definitions and theorems in your textbook.",
        "steps": [{"description": "Review the relevant definitions and theorems.", "explanation": "Identify which concepts apply to this problem."}],
        "final_answer": r"\text{See explanation above}",
    }


async def _run_proof_explanation(user_message: str, chunks_text: str) -> dict:
    client = _get_client()

    user_prompt = (
        f"Student request: {user_message}\n\n"
        f"Textbook passage:\n{chunks_text}\n\n"
        "Provide a step-by-step explanation for this proof or conceptual problem."
    )

    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a math tutor explaining a proof or conceptual problem from a textbook.\n\n"
                    "Return ONLY valid JSON with these fields:\n"
                    "- explanation: 2-3 sentence overview of the key idea and approach\n"
                    "- steps: array of 3-6 objects, each with:\n"
                    "    description (what to do, 1 sentence)\n"
                    "    explanation (why, 1-2 sentences — use $...$ for inline LaTeX)\n"
                    "    expression (optional — a key formula for this step, raw LaTeX, no delimiters)\n"
                    "- final_answer: a brief LaTeX statement of the conclusion (use \\text{} for prose)\n"
                    "- tips: 1-2 common mistakes to avoid (optional, plain string)\n\n"
                    'Example: {"explanation":"...","steps":[{"description":"...","explanation":"...","expression":"..."}],'
                    '"final_answer":"\\\\text{Therefore A is symmetric}","tips":"..."}'
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        max_tokens=1500,
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    parsed = json.loads(raw)

    steps = parsed.get("steps", [])
    if not isinstance(steps, list):
        steps = []

    return {
        "explanation": str(parsed.get("explanation", "")).strip(),
        "steps": [
            {
                "description": str(s.get("description", "")).strip(),
                "explanation": str(s.get("explanation", "")).strip(),
                **({"expression": str(s["expression"]).strip()} if s.get("expression") else {}),
            }
            for s in steps
            if isinstance(s, dict)
        ],
        "final_answer": str(parsed.get("final_answer", r"\text{See explanation above}")).strip(),
        **({"tips": str(parsed["tips"]).strip()} if parsed.get("tips") else {}),
    }
