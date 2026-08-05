import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.db.models import Attachment
from app.schemas import AttachmentOut

IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
}


def ensure_upload_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def media_url(stored_name: str) -> str:
    return f"/media/{stored_name}"


def attachment_to_out(att: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=att.id,
        original_filename=att.original_filename,
        content_type=att.content_type,
        size_bytes=att.size_bytes,
        url=media_url(att.stored_name),
        request_id=att.request_id,
        quote_id=att.quote_id,
        created_at=att.created_at,
        is_image=att.content_type.startswith("image/"),
        is_pdf=att.content_type == "application/pdf",
    )


async def save_upload_file(file: UploadFile) -> tuple[str, str, str, int]:
    """Validate and persist an upload. Returns (stored_name, original_filename, content_type, size)."""
    content_type = (file.content_type or "").lower().strip()
    if content_type not in settings.allowed_upload_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only images (JPEG, PNG, WebP, GIF) and PDF files are allowed",
        )

    data = await file.read()
    size = len(data)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max {settings.max_upload_bytes // (1024 * 1024)} MB",
        )

    original = Path(file.filename or "file").name
    ext = IMAGE_EXTENSIONS.get(content_type, Path(original).suffix.lower() or ".bin")
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = ensure_upload_dir() / stored_name
    dest.write_bytes(data)
    return stored_name, original, content_type, size
