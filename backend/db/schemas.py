"""
Pydantic v2 schemas — request/response shapes for all DB-backed endpoints.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


# ── Auth ─────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: str
    email: str


class RefreshRequest(BaseModel):
    refresh_token: str


class GoogleOAuthResponse(BaseModel):
    url: str   # redirect URL the frontend should navigate to


# ── User ─────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Session ───────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    title: Optional[str] = None


class SessionOut(BaseModel):
    id: UUID
    user_id: UUID
    title: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Message ───────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    role: str                        # "user" | "assistant"
    content: str
    solution: Optional["SolutionCreate"] = None


class MessageOut(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    created_at: datetime
    solution: Optional["SolutionOut"] = None

    model_config = {"from_attributes": True}


# ── Solution ──────────────────────────────────────────────────────────────────

class SolutionCreate(BaseModel):
    latex_input: str
    steps: list[str]
    final_answer: str


class SolutionOut(BaseModel):
    id: UUID
    message_id: UUID
    latex_input: str
    steps: list[str]
    final_answer: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Plugins ───────────────────────────────────────────────────────────────────

class PluginOut(BaseModel):
    name: str
    display_name: str
    description: str
    required_tools: list[str]
    enabled: bool
    always_enabled: bool


class PluginToggle(BaseModel):
    enabled: bool


# Resolve forward references
MessageCreate.model_rebuild()
MessageOut.model_rebuild()
