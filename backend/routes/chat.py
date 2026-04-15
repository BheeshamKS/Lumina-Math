"""
POST /chat — main orchestration endpoint.

Flow:
  1. Groq checks ambiguity.
     → ambiguous  : return clarification JSON immediately.
     → clear      : send to SymPy, then Groq formats the result.
  2. POST /chat/followup — follow-up questions in context.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.math_engine import solve_problem
from services.groq_service import check_ambiguity, format_solution, chat_followup

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class FollowupRequest(BaseModel):
    message: str
    solution_context: dict


@router.post("/chat")
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Step 1: ambiguity check
    ambiguity = check_ambiguity(req.message.strip())

    if ambiguity.get("type") == "clarification":
        return ambiguity  # {"type": "clarification", "question": ..., "options": [...]}

    # Step 2: SymPy solves it
    normalized = ambiguity.get("normalized", req.message.strip())
    try:
        sympy_result = solve_problem(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Math engine error: {exc}")

    # Step 3: Groq formats the solution
    try:
        formatted = format_solution(sympy_result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Formatting error: {exc}")

    return formatted  # {"type": "solution", "steps": [...], "final_answer": ...}


@router.post("/chat/followup")
async def followup(req: FollowupRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    try:
        reply = chat_followup(req.message.strip(), req.solution_context)
        return {"type": "followup", "message": reply}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat error: {exc}")
