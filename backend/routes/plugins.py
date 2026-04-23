"""
Plugin management endpoints.

GET  /plugins        — list all plugins with enabled state for the current user
PATCH /plugins/{name} — toggle a plugin on/off for the current user
POST /plugins/book/detect — detect recommended plugins from a book index sample
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from db.database import get_db
from db import crud, schemas
from middleware.auth import require_auth
from plugins import registry
from services.groq_explainer import detect_plugins_from_book
from pydantic import BaseModel

router = APIRouter()


class BookDetectRequest(BaseModel):
    sample_index: list[dict]


class BookDetectResponse(BaseModel):
    recommended_plugins: list[str]


@router.get("/plugins", response_model=list[schemas.PluginOut])
def list_plugins(
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    supabase_uid = payload["sub"]
    user = crud.get_user_by_supabase_uid(db, supabase_uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    overrides = crud.get_user_plugin_overrides(db, user.id)
    result = []
    for info in registry.all_plugins():
        if info.always_enabled:
            enabled = True
        else:
            enabled = overrides.get(info.name, info.enabled_by_default)
        result.append(schemas.PluginOut(
            name=info.name,
            display_name=info.display_name,
            description=info.description,
            required_tools=info.required_tools,
            enabled=enabled,
            always_enabled=info.always_enabled,
        ))
    return result


@router.patch("/plugins/{name}", response_model=schemas.PluginOut)
def toggle_plugin(
    name: str,
    body: schemas.PluginToggle,
    payload: dict = Depends(require_auth),
    db: DBSession = Depends(get_db),
):
    if not registry.is_valid_plugin(name):
        raise HTTPException(status_code=404, detail=f"Plugin '{name}' not found.")

    info = registry.get_plugin(name)
    if info and info.always_enabled and not body.enabled:
        raise HTTPException(status_code=400, detail=f"Plugin '{name}' is always enabled and cannot be disabled.")

    supabase_uid = payload["sub"]
    user = crud.get_user_by_supabase_uid(db, supabase_uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    crud.set_user_plugin(db, user.id, name, body.enabled)

    return schemas.PluginOut(
        name=info.name,
        display_name=info.display_name,
        description=info.description,
        required_tools=info.required_tools,
        enabled=body.enabled,
        always_enabled=info.always_enabled,
    )


@router.post("/plugins/book/detect", response_model=BookDetectResponse)
async def book_detect(req: BookDetectRequest):
    recommended = await detect_plugins_from_book(req.sample_index)
    return BookDetectResponse(recommended_plugins=recommended)
