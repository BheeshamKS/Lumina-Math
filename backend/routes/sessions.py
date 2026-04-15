"""
Session + Message routes — all protected by JWT.

GET    /sessions                      → list user's sessions
POST   /sessions                      → create new session
DELETE /sessions/{session_id}         → delete session

GET    /sessions/{session_id}/messages  → full chat history
POST   /sessions/{session_id}/messages  → save message (+ optional solution)
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from db.database import get_db
from db import crud, schemas
from middleware.auth import require_auth

router = APIRouter(tags=["sessions"])


def _resolve_user(payload: dict, db: DBSession):
    """Get our internal User row from the JWT payload's sub (Supabase UID)."""
    supabase_uid: str = payload.get("sub", "")
    user = crud.get_user_by_supabase_uid(db, supabase_uid)
    if not user:
        raise HTTPException(status_code=404, detail="User record not found. Please log in again.")
    return user


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[schemas.SessionOut])
async def list_sessions(
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    user = _resolve_user(payload, db)
    return crud.list_sessions(db, user.id)


@router.post("/sessions", response_model=schemas.SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    req: schemas.SessionCreate,
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    user = _resolve_user(payload, db)
    return crud.create_session(db, user.id, title=req.title)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    user = _resolve_user(payload, db)
    session = crud.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    crud.delete_session(db, session)


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/messages", response_model=list[schemas.MessageOut])
async def get_messages(
    session_id: UUID,
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    user = _resolve_user(payload, db)
    session = crud.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return crud.list_messages(db, session_id)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=schemas.MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def save_message(
    session_id: UUID,
    req: schemas.MessageCreate,
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    user = _resolve_user(payload, db)
    session = crud.get_session(db, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Auto-set session title from first user message
    if req.role == "user" and not session.title:
        title = req.content[:60] + ("…" if len(req.content) > 60 else "")
        crud.update_session_title(db, session, title)

    message = crud.create_message(
        db,
        session_id=session_id,
        role=req.role,
        content=req.content,
        solution_data=req.solution,
    )
    return message
