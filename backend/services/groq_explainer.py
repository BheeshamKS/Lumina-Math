"""
groq_explainer.py — Enriches SymPy solution steps with plain-English explanations.

Design:
  - One Groq call per solve (all steps in a single prompt).
  - Uses llama-3.1-8b-instant: fast, low-latency, good JSON compliance.
  - Hard 8-second timeout; any failure returns the original steps unchanged.
  - Explanations are merged back without touching any other step field.
"""

import os
import json
import asyncio
import logging

from groq import AsyncGroq

logger = logging.getLogger(__name__)

_client: AsyncGroq | None = None


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


async def extract_from_book_context(user_message: str, chunks: list[dict]) -> str:
    """
    Use Groq to extract the specific LaTeX math problem from book chunks + user message.
    Returns a SymPy-ready problem string. Falls back to user_message on any failure.
    """
    if not chunks or not os.getenv("GROQ_API_KEY"):
        return user_message

    try:
        return await asyncio.wait_for(_extract_book(user_message, chunks), timeout=10.0)
    except Exception as exc:
        logger.warning("Book context extraction failed — using raw message: %s", exc)
        return user_message


async def _extract_book(user_message: str, chunks: list[dict]) -> str:
    client = _get_client()

    chunks_text = json.dumps(chunks[:5], ensure_ascii=False)  # cap at 5 chunks
    prompt = (
        f"User request: {user_message}\n\n"
        f"Relevant textbook excerpts (JSON): {chunks_text}\n\n"
        "Extract the specific math problem the user wants to solve. "
        "Return ONLY the problem as a SymPy-ready expression or equation (plain text or LaTeX). "
        "No explanation, no extra text — just the math problem string."
    )

    resp = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": "You extract math problems from textbook context. Return only the raw math expression or equation."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=256,
        temperature=0.1,
    )
    return resp.choices[0].message.content.strip()


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
