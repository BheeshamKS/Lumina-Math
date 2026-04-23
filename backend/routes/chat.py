"""
POST /chat — SymPy solver + Groq step explanations.

Flow:
  1. Optional plugin gating: classify the problem domain, check if the
     required plugin is enabled for the authenticated user (if token provided).
  2. Optional book context: if book_context is supplied, Groq first extracts
     the LaTeX problem from the provided chunks.
  3. SymPy solves the (possibly extracted) expression.
  4. Groq enriches each step with a plain-English explanation
     (single batch call, 8 s timeout, graceful degradation).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from jose import jwt, JWTError
import os

from services.math_engine import solve_problem, classify_problem_domain
from services.groq_explainer import explain_steps, extract_from_book_context
from db.database import get_db
from db import crud
from sqlalchemy.orm import Session as DBSession
from fastapi import Depends

router = APIRouter()


class BookChunk(BaseModel):
    chapter: Optional[int] = None
    exercise: Optional[str] = None
    question_number: Optional[int] = None
    latex_content: str
    page: Optional[int] = None


class BookContext(BaseModel):
    chunks: list[BookChunk]


class ChatRequest(BaseModel):
    message: str
    book_context: Optional[BookContext] = None


def _decode_token_soft(authorization: Optional[str]) -> Optional[str]:
    """Return supabase_uid from Authorization header, or None if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        return payload.get("sub")
    except JWTError:
        return None


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
async def chat(
    req: ChatRequest,
    authorization: Optional[str] = Header(None),
    db: DBSession = Depends(get_db),
):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # ── Optional plugin gating ────────────────────────────────────────────────
    supabase_uid = _decode_token_soft(authorization)
    if supabase_uid:
        user = crud.get_user_by_supabase_uid(db, supabase_uid)
        if user:
            domain = classify_problem_domain(req.message.strip())
            if domain != "core":
                overrides = crud.get_user_plugin_overrides(db, user.id)
                # Plugin is disabled only if explicitly set to False in DB
                if overrides.get(domain) is False:
                    raise HTTPException(
                        status_code=403,
                        detail=f"The '{domain}' plugin is disabled. Enable it in Plugin Settings to solve this problem.",
                    )

    # ── Optional book context extraction ─────────────────────────────────────
    problem_text = req.message.strip()
    if req.book_context and req.book_context.chunks:
        chunks_dicts = [c.model_dump() for c in req.book_context.chunks]
        problem_text = await extract_from_book_context(problem_text, chunks_dicts)

    # ── Step 1: SymPy solves ──────────────────────────────────────────────────
    try:
        raw = solve_problem(problem_text)
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
