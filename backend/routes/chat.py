"""
POST /chat — SymPy solver + Groq step explanations.

Flow:
  1. Optional plugin gating: classify the problem domain, check if the
     required plugin is enabled for the authenticated user (if token provided).
  2. Optional book context: when book_context chunks are present Groq extracts
     the actual math expression first; raises 422 if it cannot extract one.
  3. SymPy solves the extracted (or raw) expression.
  4. Groq enriches each step with a plain-English explanation
     (single batch call, 8 s timeout, graceful degradation).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
import os

from services.math_engine import solve_problem, classify_problem_domain
from services.groq_explainer import explain_steps, extract_problem_strict
from db.database import get_db
from db import crud
from sqlalchemy.orm import Session as DBSession
from middleware.auth import _jwks_client, _token_alg

import jwt as pyjwt
from jose import jwt as jose_jwt, JWTError

router = APIRouter()


class BookChunk(BaseModel):
    chapter: Optional[int] = None
    exercise: Optional[str] = None
    question_number: Optional[int] = None
    latex_content: str
    page: Optional[int] = None


class ChatRequest(BaseModel):
    message: str
    book_context: Optional[list[BookChunk]] = None


def _decode_token_soft(authorization: Optional[str]) -> Optional[str]:
    """Return supabase_uid from Authorization header, or None if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        alg = _token_alg(token)
        if alg == "HS256":
            secret = os.getenv("SUPABASE_JWT_SECRET", "")
            if not secret:
                return None
            payload = jose_jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        else:
            signing_key = _jwks_client().get_signing_key_from_jwt(token)
            payload = pyjwt.decode(token, signing_key.key, algorithms=[alg], options={"verify_aud": False})
        return payload.get("sub")
    except Exception:
        return None


def _to_solution(raw: dict) -> dict:
    steps = raw.get("steps", [])
    if raw.get("type") == "equation":
        solutions = raw.get("solutions", [])
        var = raw.get("variable", "x")
        final_answer = (
            " \\quad ".join(f"{var} = {s}" for s in solutions)
            if solutions else "\\text{No real solutions}"
        )
    else:
        final_answer = raw.get("result", "")
    return {"type": "solution", "steps": steps, "final_answer": final_answer}


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
                if overrides.get(domain) is False:
                    raise HTTPException(
                        status_code=403,
                        detail=f"The '{domain}' plugin is disabled. Enable it in Plugin Settings to solve this problem.",
                    )

    # ── Book context extraction (hard path) ───────────────────────────────────
    if req.book_context:
        chunks_dicts = [c.model_dump() for c in req.book_context]
        try:
            problem_text = await extract_problem_strict(req.message.strip(), chunks_dicts)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    else:
        problem_text = req.message.strip()

    # ── SymPy solves ──────────────────────────────────────────────────────────
    try:
        raw = solve_problem(problem_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Math engine error: {exc}")

    solution = _to_solution(raw)

    # ── Groq explains each step (best-effort) ─────────────────────────────────
    solution["steps"] = await explain_steps(
        problem=req.message.strip(),
        steps=solution["steps"],
        final_answer=solution["final_answer"],
    )

    return solution
