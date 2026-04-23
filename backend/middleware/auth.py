"""
JWT authentication middleware.

Supabase may issue HS256 (legacy) or ES256 (current) JWTs.
- HS256: verified with SUPABASE_JWT_SECRET
- ES256: verified via Supabase's JWKS endpoint (PyJWKClient handles caching)
"""

import os
from functools import lru_cache
from typing import Annotated

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt as jose_jwt, JWTError

_bearer = HTTPBearer(auto_error=True)


def _get_jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not set in the environment.")
    return secret


def _get_supabase_url() -> str:
    url = os.environ.get("SUPABASE_URL", "")
    if not url:
        raise RuntimeError("SUPABASE_URL is not set in the environment.")
    return url.rstrip("/")


@lru_cache(maxsize=1)
def _jwks_client() -> pyjwt.PyJWKClient:
    jwks_url = f"{_get_supabase_url()}/auth/v1/.well-known/jwks.json"
    return pyjwt.PyJWKClient(jwks_url, cache_keys=True)


def _token_alg(token: str) -> str:
    header = jose_jwt.get_unverified_header(token)
    return header.get("alg", "HS256")


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    """
    FastAPI dependency — verifies Bearer JWT and returns the decoded payload.

    Usage:
        @router.get("/protected")
        async def handler(payload: dict = Depends(require_auth)):
            user_uid = payload["sub"]
    """
    token = credentials.credentials

    try:
        alg = _token_alg(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token header: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        if alg == "HS256":
            payload = jose_jwt.decode(
                token,
                _get_jwt_secret(),
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            # ES256 or other asymmetric alg — fetch signing key from JWKS
            signing_key = _jwks_client().get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
        return payload
    except (JWTError, pyjwt.exceptions.PyJWTError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
