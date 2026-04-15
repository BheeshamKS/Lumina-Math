"""
CRUD helpers — all DB mutations go through here, never directly in route handlers.
"""

from uuid import UUID
from sqlalchemy.orm import Session as DBSession

from db.models import User, Session, Message, Solution
from db import schemas


# ── Users ─────────────────────────────────────────────────────────────────────

def get_user_by_supabase_uid(db: DBSession, supabase_uid: str) -> User | None:
    return db.query(User).filter(User.supabase_uid == supabase_uid).first()


def get_user_by_email(db: DBSession, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def create_user(db: DBSession, email: str, supabase_uid: str) -> User:
    user = User(email=email, supabase_uid=supabase_uid)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_or_create_user(db: DBSession, email: str, supabase_uid: str) -> User:
    user = get_user_by_supabase_uid(db, supabase_uid)
    if not user:
        user = create_user(db, email, supabase_uid)
    return user


# ── Sessions ──────────────────────────────────────────────────────────────────

def list_sessions(db: DBSession, user_id: UUID) -> list[Session]:
    return (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .order_by(Session.created_at.desc())
        .all()
    )


def get_session(db: DBSession, session_id: UUID, user_id: UUID) -> Session | None:
    return (
        db.query(Session)
        .filter(Session.id == session_id, Session.user_id == user_id)
        .first()
    )


def create_session(db: DBSession, user_id: UUID, title: str | None = None) -> Session:
    session = Session(user_id=user_id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def update_session_title(db: DBSession, session: Session, title: str) -> Session:
    session.title = title
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: DBSession, session: Session) -> None:
    db.delete(session)
    db.commit()


# ── Messages ──────────────────────────────────────────────────────────────────

def list_messages(db: DBSession, session_id: UUID) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at)
        .all()
    )


def create_message(
    db: DBSession,
    session_id: UUID,
    role: str,
    content: str,
    solution_data: schemas.SolutionCreate | None = None,
) -> Message:
    message = Message(session_id=session_id, role=role, content=content)
    db.add(message)
    db.flush()  # get message.id before commit

    if solution_data:
        solution = Solution(
            message_id=message.id,
            latex_input=solution_data.latex_input,
            steps=solution_data.steps,
            final_answer=solution_data.final_answer,
        )
        db.add(solution)

    db.commit()
    db.refresh(message)
    return message
