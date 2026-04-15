"""
Groq service — Llama3-70b via Groq API.

Responsibilities:
  1. check_ambiguity  — decide if input is ambiguous, return clarification JSON.
  2. format_solution  — format SymPy steps into classroom prose, return solution JSON.
  3. chat_followup    — answer follow-up questions in free-text.

JSON endpoints use response_format={"type":"json_object"} so the model CANNOT
return prose — any non-JSON output is a hard API error caught at the call site.
The LLM never performs arithmetic; it only narrates what SymPy computed.
"""

import json
import os
import re
from groq import Groq

MODEL = "llama-3.3-70b-versatile"
_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _client


# ── System prompts ────────────────────────────────────────────────────────────

AMBIGUITY_SYSTEM = """\
You are a math input parser. Your ONLY job is to decide if a math problem string
is ambiguous (missing variable names, unclear operators, incomplete expressions)
and, if so, generate reasonable interpretations.

Respond with JSON only — no markdown, no prose outside the JSON object.

If ambiguous, return EXACTLY:
{"type":"clarification","question":"Did you mean one of these?","options":["...", "..."]}

If unambiguous and solvable, return EXACTLY:
{"type":"clear","normalized":"<cleaned expression, e.g. '2*x + 4 = 8'>"}

Rules:
- Single-letter variables are fine (x, y, z, n, t).
- Pure arithmetic (e.g. "2 + 4") is NOT ambiguous — mark as clear.
- Generate 2–4 options for ambiguous inputs only.
- Keep options concise: "2x + 4 = 8" not "The equation 2x + 4 equals 8".
- Always output valid JSON. Never output anything outside the JSON object.

Matrix rules (IMPORTANT):
- ANY expression containing a matrix (LaTeX pmatrix/bmatrix/vmatrix or list notation) is NEVER ambiguous — always return "clear".
- Normalize matrices as Python list-of-lists: [[a,b],[c,d]].
- Use * for matrix multiplication: [[1,2],[3,4]] * [[5,6],[7,8]]
- Use + or - for element-wise addition/subtraction.
- "det([[1,2],[3,4]])" for determinant, "inv([[1,2],[3,4]])" for inverse.\
"""

FORMAT_SYSTEM = """\
You are Lumina, a friendly high-school math tutor. SymPy already computed the
correct answer and generated the mathematical steps. Your ONLY job is to write
natural-language explanations a student can follow.

Respond with JSON only — no markdown, no prose outside the JSON object.

Return EXACTLY this structure:
{
  "type": "solution",
  "explanation": "<1-2 sentence overview of the problem type and method used>",
  "steps": [
    {
      "title": "<short action name, e.g. 'Subtract 4 from both sides'>",
      "explanation": "<1-2 sentences: WHY this step is done and what rule applies>",
      "expression": "<the LaTeX string from SymPy — copy it EXACTLY, do NOT alter>"
    }
  ],
  "final_answer": "<copy the final LaTeX answer from SymPy EXACTLY>",
  "tips": "<one tip about a common mistake students make on this type of problem>"
}

Critical rules:
- Copy every LaTeX expression character-for-character from the SymPy data.
- Never perform, verify, or simplify any arithmetic yourself.
- If type is 'derivative', name the differentiation rule used (chain, product, etc.).
- If type is 'integral', name the integration technique (u-sub, IBP, power rule, etc.).
- Always output valid JSON. Never output anything outside the JSON object.

LaTeX formatting rules (MANDATORY — violations will break the UI renderer):
- Wrap every inline math variable, number, or expression in single dollar signs: $x$, $n = 5$, $x^2 - 4$.
- Wrap every standalone or display-level equation in double dollar signs: $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$
- NEVER use Unicode math symbols in prose. Use LaTeX commands inside delimiters instead:
    BAD:  "the answer is ½"      GOOD: "the answer is $\frac{1}{2}$"
    BAD:  "compute ∫x dx"        GOOD: "compute $\int x \, dx$"
    BAD:  "angle θ = 90°"        GOOD: "angle $\theta = 90°$"
    BAD:  "sum ∑ from 1 to n"    GOOD: "sum $\sum_{i=1}^{n}$"
- The "expression" fields contain raw SymPy LaTeX — copy them verbatim with NO dollar signs added.\
"""

CHAT_SYSTEM = """\
You are Lumina, a friendly and precise high-school math tutor.
A student is asking a follow-up question about a math problem that was already solved.
The full solution context is provided.

Answer conversationally but accurately. Keep your response to 3 paragraphs maximum.
Do not repeat the full solution — answer only the specific question asked.

LaTeX formatting rules (MANDATORY — violations will break the UI renderer):
- Every math variable, number in context, or expression MUST be wrapped in $...$: e.g. $x$, $f(x) = x^2$, $n = 3$.
- Standalone or display equations MUST use $$...$$: e.g. $$\frac{d}{dx}(x^n) = nx^{n-1}$$
- NEVER use Unicode math symbols (½ ∫ ∑ ∞ π θ α β √ ×) in plain text.
  Always use their LaTeX equivalents inside delimiters:
    ½ → $\frac{1}{2}$    ∫ → $\int$    ∑ → $\sum$    ∞ → $\infty$
    π → $\pi$            √ → $\sqrt{}$  × → $\times$  ≤ → $\leq$\
"""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _call_json(messages: list[dict], temperature: float = 0.1) -> dict:
    """
    Call Groq with JSON mode enforced. Returns parsed dict.
    Raises ValueError if the model returns invalid JSON (should be rare).
    """
    resp = _get_client().chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=2000,
        response_format={"type": "json_object"},   # ← hard enforcement
    )
    raw = resp.choices[0].message.content
    # Belt-and-suspenders: strip any accidental fences before parsing
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Groq returned non-JSON despite json_object mode: {cleaned[:200]}") from exc


def _call_text(messages: list[dict], temperature: float = 0.5) -> str:
    """Call Groq without JSON mode — for free-text follow-up responses."""
    resp = _get_client().chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=800,
    )
    return resp.choices[0].message.content


# ── Public API ────────────────────────────────────────────────────────────────

def check_ambiguity(user_input: str) -> dict:
    """
    Returns one of:
      {"type": "clarification", "question": "...", "options": [...]}
      {"type": "clear", "normalized": "..."}
    """
    messages = [
        {"role": "system", "content": AMBIGUITY_SYSTEM},
        {"role": "user",   "content": user_input},
    ]
    result = _call_json(messages, temperature=0.1)

    # Validate shape — if Groq hallucinates a different key, fall back to clear
    if result.get("type") not in ("clarification", "clear"):
        return {"type": "clear", "normalized": user_input}

    # Clarification must have non-empty options list
    if result["type"] == "clarification":
        if not result.get("options"):
            return {"type": "clear", "normalized": user_input}

    return result


def format_solution(sympy_result: dict) -> dict:
    """
    Takes the dict from math_engine.solve_problem() and returns a
    student-friendly JSON solution with classroom-style explanations.
    """
    solutions = sympy_result.get("solutions") or []
    final_ans = (
        sympy_result.get("result")
        or (", ".join(solutions) if solutions else "")
        or ""
    )

    prompt = (
        f"Problem type: {sympy_result.get('type', 'unknown')}\n\n"
        f"SymPy computed steps (copy LaTeX strings EXACTLY — do NOT recalculate):\n"
        f"{json.dumps(sympy_result['steps'], indent=2)}\n\n"
        f"Final answer LaTeX: {final_ans}\n\n"
        f"Write classroom explanations for each step following the JSON schema."
    )

    messages = [
        {"role": "system", "content": FORMAT_SYSTEM},
        {"role": "user",   "content": prompt},
    ]
    result = _call_json(messages, temperature=0.3)

    # Enforce required keys
    result.setdefault("type", "solution")
    result.setdefault("explanation", "")
    result.setdefault("steps", [])
    result.setdefault("final_answer", final_ans)
    result.setdefault("tips", "")

    # Attach raw SymPy data so the frontend can access original LaTeX
    result["sympy"] = sympy_result
    return result


def chat_followup(user_message: str, solution_context: dict) -> str:
    """Answer a follow-up question in the context of a prior solution."""
    context_str = json.dumps(
        {
            "type":         solution_context.get("type"),
            "explanation":  solution_context.get("explanation", ""),
            "steps":        solution_context.get("steps", []),
            "final_answer": solution_context.get("final_answer", ""),
        },
        indent=2,
    )
    messages = [
        {"role": "system", "content": CHAT_SYSTEM},
        {
            "role": "user",
            "content": f"Solution context:\n{context_str}\n\nStudent question: {user_message}",
        },
    ]
    return _call_text(messages, temperature=0.5)
