"""
POST /extract-image — OCR.space vision pipeline.

Accepts a multipart image upload, returns extracted math/LaTeX string,
which the frontend then routes directly to POST /chat.
"""

from fastapi import APIRouter, File, UploadFile, HTTPException
from services.ocr_service import extract_math_from_image

router = APIRouter()

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/extract-image")
async def extract_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.",
        )

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Max 10 MB.")

    try:
        latex_str = extract_math_from_image(data, mime_type=file.content_type)
        return {"extracted": latex_str}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Vision error: {exc}")
