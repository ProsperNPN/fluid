import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.core.config import settings

ALLOWED_TYPES = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
MAGIC = {"application/pdf": (b"%PDF",), "image/jpeg": (b"\xff\xd8\xff",), "image/png": (b"\x89PNG\r\n\x1a\n",)}


async def save_verification_file(upload: UploadFile) -> tuple[str, str, int, str]:
    content_type = (upload.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=422, detail="Only PDF, JPEG, and PNG documents are allowed")
    data = await upload.read(settings.VERIFICATION_MAX_FILE_BYTES + 1)
    if not data or len(data) > settings.VERIFICATION_MAX_FILE_BYTES:
        raise HTTPException(status_code=422, detail="Document is empty or exceeds the configured size limit")
    if not any(data.startswith(signature) for signature in MAGIC[content_type]):
        raise HTTPException(status_code=422, detail="Document contents do not match the declared file type")
    storage_key = f"{uuid4().hex}{ALLOWED_TYPES[content_type]}"
    root = Path(settings.VERIFICATION_UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    (root / storage_key).write_bytes(data)
    return storage_key, content_type, len(data), hashlib.sha256(data).hexdigest()


def verification_file_path(storage_key: str) -> Path:
    root = Path(settings.VERIFICATION_UPLOAD_DIR).resolve()
    path = (root / storage_key).resolve()
    if path.parent != root or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return path
