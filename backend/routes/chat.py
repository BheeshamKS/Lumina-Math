"""
POST /chat — SymPy solver + Groq step explanations.

Flow:
  1. SymPy solves the expression (math_engine.solve_problem).
  2. Result is normalised to {type, steps, final_answer}.
  3. Groq enriches each step with a plain-English explanation
     (single batch call, 8 s timeout, graceful degradation).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.math_engine import solve_problem
from services.groq_explainer import explain_steps

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


def _to_solution(raw: dict) -> dict:
    """
    Normalize any math_engine result into the flat format the frontend expects:
      { type: 'solution', steps: [...], final_answer: ... }
    """
    steps = raw.get("steps", [])

    if raw.get("type") == "equation":
        solutions = raw.get("solutions", [])
        var = raw.get("variable", "x")
        if solutions:
            final_answer = " \\quad ".join(f"{var} = {s}" for s in solutions)
        else:
            final_answer = "\\text{No real solutions}"
    else:
        final_answer = raw.get("result", "")

    return {
        "type": "solution",
        "steps": steps,
        "final_answer": final_answer,
    }


@router.post("/chat")
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # ── Step 1: SymPy solves ──────────────────────────────────────────────────
    try:
        raw = solve_problem(req.message.strip())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Math engine error: {exc}")

    solution = _to_solution(raw)

    # ── Step 2: Groq explains each step (best-effort) ─────────────────────────
    solution["steps"] = await explain_steps(
        problem=req.message.strip(),
        steps=solution["steps"],
        final_answer=solution["final_answer"],
    )

    return solution
