from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Attachment
from app.schemas import AttachmentOut
from app.services.uploads import attachment_to_out


def list_attachments_for_request(db: Session, request_id: UUID) -> list[AttachmentOut]:
    rows = db.scalars(
        select(Attachment).where(Attachment.request_id == request_id).order_by(Attachment.created_at.asc())
    ).all()
    return [attachment_to_out(a) for a in rows]


def list_attachments_for_quote(db: Session, quote_id: UUID) -> list[AttachmentOut]:
    rows = db.scalars(
        select(Attachment).where(Attachment.quote_id == quote_id).order_by(Attachment.created_at.asc())
    ).all()
    return [attachment_to_out(a) for a in rows]


def link_attachments(
    db: Session,
    *,
    attachment_ids: list[UUID],
    uploader_id: UUID,
    request_id: UUID | None = None,
    quote_id: UUID | None = None,
) -> list[Attachment]:
    if not attachment_ids:
        return []
    if len(attachment_ids) > settings.max_attachments_per_entity:
        raise HTTPException(
            status_code=400,
            detail=f"Max {settings.max_attachments_per_entity} attachments allowed",
        )

    linked: list[Attachment] = []
    for aid in attachment_ids:
        att = db.get(Attachment, aid)
        if not att or att.uploaded_by != uploader_id:
            raise HTTPException(status_code=400, detail=f"Invalid attachment: {aid}")
        if att.request_id is not None or att.quote_id is not None:
            raise HTTPException(status_code=400, detail=f"Attachment already linked: {aid}")
        att.request_id = request_id
        att.quote_id = quote_id
        linked.append(att)
    return linked
