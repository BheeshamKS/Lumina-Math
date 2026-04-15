"""
JWT authentication middleware.

Supabase issues HS256 JWTs signed with SUPABASE_JWT_SECRET.
Every protected route uses `require_auth` as a FastAPI dependency.
The dependency returns the verified payload so handlers can read `sub` (Supabase UID).
"""

import os
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

_bearer = HTTPBearer(auto_error=True)


def _get_jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not set in the environment.")
    return secret


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    """
    FastAPI dependency. Verifies the Bearer JWT and returns the decoded payload.

    Usage in a route:
        @router.get("/protected")
        async def handler(payload: dict = Depends(require_auth)):
            user_uid = payload["sub"]
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            # Supabase audience claim
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
