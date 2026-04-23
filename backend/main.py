"""
Lumina Math — FastAPI entry point.
Load order: .env → app creation → middleware → routers.
"""

import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command
from pathlib import Path

from routes.auth import router as auth_router
from routes.sessions import router as sessions_router
from routes.solve import router as solve_router
from routes.chat import router as chat_router
from routes.plugins import router as plugins_router
import plugins  # noqa: F401 — triggers plugin self-registration

def _run_migrations():
    ini_path = Path(__file__).parent / "alembic.ini"
    cfg = AlembicConfig(str(ini_path))
    cfg.set_main_option("script_location", str(Path(__file__).parent / "db" / "migrations"))
    alembic_command.upgrade(cfg, "head")


app = FastAPI(
    title="Lumina Math API",
    description="Math Solver — SymPy · Supabase",
    version="1.0.0",
    on_startup=[_run_migrations],
)

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router,     prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(solve_router,    prefix="/api")
app.include_router(chat_router,     prefix="/api")
app.include_router(plugins_router,  prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "lumina-math-api", "version": "1.0.0"}
