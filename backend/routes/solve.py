"""POST /solve — Pure SymPy math engine endpoint."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.math_engine import solve_problem

router = APIRouter()


class SolveRequest(BaseModel):
    expression: str  # LaTeX or plain algebraic text


@router.post("/solve")
async def solve(req: SolveRequest):
    if not req.expression.strip():
        raise HTTPException(status_code=400, detail="Expression cannot be empty.")
    try:
        result = solve_problem(req.expression.strip())
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Math engine error: {exc}")
