"""
OCR.space — image-to-text extraction only.
This service is NEVER called for text input; only for uploaded images.

Free tier key: register at https://ocr.space/ocrapi (25k req/month).
Set OCR_SPACE_API_KEY in .env.
"""

import base64
import io
import os
import re

import httpx
from PIL import Image

OCR_API_URL = "https://api.ocr.space/parse/image"


def extract_math_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Send image bytes to OCR.space and return the extracted text (math expression).
    Raises ValueError for unreadable images or API errors.
    """
    api_key = os.environ.get("OCR_SPACE_API_KEY", "helloworld")

    # Preprocess: upscale tiny images, convert to RGB JPEG
    img = Image.open(io.BytesIO(image_bytes))

    if img.width < 400 or img.height < 200:
        scale = max(400 / img.width, 200 / img.height)
        new_size = (int(img.width * scale), int(img.height * scale))
        img = img.resize(new_size, Image.LANCZOS)

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    processed_bytes = buf.getvalue()

    b64 = base64.b64encode(processed_bytes).decode()
    data_uri = f"data:image/jpeg;base64,{b64}"

    try:
        resp = httpx.post(
            OCR_API_URL,
            data={
                "apikey": api_key,
                "base64Image": data_uri,
                "language": "eng",
                "isOverlayRequired": "false",
                "detectOrientation": "true",
                "scale": "true",
                "OCREngine": "2",   # Engine 2 handles printed math better
            },
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ValueError(f"OCR API request failed ({exc.response.status_code}).")
    except httpx.RequestError as exc:
        raise ValueError(f"OCR API unreachable: {exc}")

    payload = resp.json()

    if payload.get("IsErroredOnProcessing"):
        err_msg = payload.get("ErrorMessage") or ["Unknown OCR error"]
        if isinstance(err_msg, list):
            err_msg = " ".join(err_msg)
        raise ValueError(f"OCR processing error: {err_msg}")

    results = payload.get("ParsedResults") or []
    if not results:
        raise ValueError("The image is too blurry or does not contain recognizable text.")

    raw_text = results[0].get("ParsedText", "").strip()

    if not raw_text:
        raise ValueError("The image is too blurry or does not contain recognizable math.")

    # Collapse excessive whitespace / newlines while preserving multi-expression lines
    cleaned = re.sub(r"\r\n|\r", "\n", raw_text)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    return cleaned
