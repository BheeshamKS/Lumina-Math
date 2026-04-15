"""
Auth routes — delegate credential management to Supabase Auth.
We never store passwords; Supabase owns the auth layer.

POST /auth/signup   → supabase.auth.sign_up
POST /auth/login    → supabase.auth.sign_in_with_password
POST /auth/refresh  → supabase.auth.refresh_session
POST /auth/google   → supabase.auth.sign_in_with_oauth  (returns redirect URL)
GET  /auth/callback → exchange OAuth code for session
"""

import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from supabase import create_client, Client

from db.database import get_db
from db import crud, schemas

router = APIRouter(prefix="/auth", tags=["auth"])


def _supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def _make_auth_response(session, user) -> schemas.AuthResponse:
    return schemas.AuthResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        user_id=str(user.id),
        email=user.email,
    )


# ── Sign up ───────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=schemas.AuthResponse)
async def signup(req: schemas.SignupRequest, db: DBSession = Depends(get_db)):
    sb = _supabase()
    try:
        resp = sb.auth.sign_up({"email": req.email, "password": req.password})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if resp.user is None:
        raise HTTPException(status_code=400, detail="Signup failed — check your email for a confirmation link.")

    crud.get_or_create_user(db, email=resp.user.email, supabase_uid=resp.user.id)

    if resp.session is None:
        raise HTTPException(
            status_code=202,
            detail="Confirmation email sent. Please verify your email before logging in.",
        )

    return _make_auth_response(resp.session, resp.user)


# ── Log in ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=schemas.AuthResponse)
async def login(req: schemas.LoginRequest, db: DBSession = Depends(get_db)):
    sb = _supabase()
    try:
        resp = sb.auth.sign_in_with_password({"email": req.email, "password": req.password})
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if resp.session is None:
        raise HTTPException(status_code=401, detail="Login failed.")

    crud.get_or_create_user(db, email=resp.user.email, supabase_uid=resp.user.id)

    return _make_auth_response(resp.session, resp.user)


# ── Token refresh ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=schemas.AuthResponse)
async def refresh_token(req: schemas.RefreshRequest, db: DBSession = Depends(get_db)):
    sb = _supabase()
    try:
        resp = sb.auth.refresh_session(req.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    if resp.session is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    crud.get_or_create_user(db, email=resp.user.email, supabase_uid=resp.user.id)

    return _make_auth_response(resp.session, resp.user)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post("/google", response_model=schemas.GoogleOAuthResponse)
async def google_oauth():
    sb = _supabase()
    try:
        resp = sb.auth.sign_in_with_oauth(
            {
                "provider": "google",
                "options": {
                    "redirect_to": f"{os.environ.get('SUPABASE_URL', '')}/auth/v1/callback"
                },
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return schemas.GoogleOAuthResponse(url=resp.url)


# ── OAuth callback ────────────────────────────────────────────────────────────

@router.get("/callback")
async def oauth_callback(code: str, db: DBSession = Depends(get_db)):
    sb = _supabase()
    try:
        resp = sb.auth.exchange_code_for_session({"auth_code": code})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if resp.session is None:
        raise HTTPException(status_code=400, detail="OAuth exchange failed.")

    crud.get_or_create_user(db, email=resp.user.email, supabase_uid=resp.user.id)

    return _make_auth_response(resp.session, resp.user)
