from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import Attachment, User
from app.db.session import get_db
from app.schemas import AttachmentOut
from app.services.uploads import attachment_to_out, save_upload_file

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an image or PDF. Link it later via request/quote attachment_ids."""
    stored_name, original, content_type, size = await save_upload_file(file)
    att = Attachment(
        uploaded_by=current_user.id,
        original_filename=original,
        content_type=content_type,
        stored_name=stored_name,
        size_bytes=size,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return attachment_to_out(att)


@router.post("/batch", response_model=list[AttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_files(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(files) > settings.max_attachments_per_entity:
        raise HTTPException(
            status_code=400,
            detail=f"Max {settings.max_attachments_per_entity} files per upload",
        )
    results: list[AttachmentOut] = []
    for file in files:
        stored_name, original, content_type, size = await save_upload_file(file)
        att = Attachment(
            uploaded_by=current_user.id,
            original_filename=original,
            content_type=content_type,
            stored_name=stored_name,
            size_bytes=size,
        )
        db.add(att)
        db.flush()
        results.append(attachment_to_out(att))
    db.commit()
    return results


@router.get("/{attachment_id}", response_model=AttachmentOut)
def get_attachment(
    attachment_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    att = db.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment_to_out(att)
