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
