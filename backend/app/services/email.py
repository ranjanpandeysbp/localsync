"""Transactional email using admin-configured SMTP settings + file templates."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppSmtpConfig
from app.services import email_templates as templates

logger = logging.getLogger(__name__)


def _login_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}/?login=1"


def get_or_create_smtp_config(db: Session) -> AppSmtpConfig:
    row = db.get(AppSmtpConfig, 1)
    if row:
        return row
    row = AppSmtpConfig(id=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def send_email(
    db: Session,
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> None:
    """
    Send an email using the admin SMTP config.
    Raises ValueError if SMTP is disabled/incomplete.
    Raises smtplib.SMTPException (or OSError) on delivery failure.
    """
    cfg = get_or_create_smtp_config(db)
    if not cfg.is_enabled:
        raise ValueError("SMTP is disabled. Enable it in Admin → Config.")
    if not cfg.host or not cfg.from_email:
        raise ValueError("SMTP host and from email are required.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg.from_name} <{cfg.from_email}>" if cfg.from_name else cfg.from_email
    msg["To"] = to_email
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    timeout = 20
    if cfg.use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=timeout, context=context) as server:
            if cfg.username:
                server.login(cfg.username, cfg.password or "")
            server.send_message(msg)
    else:
        with smtplib.SMTP(cfg.host, cfg.port, timeout=timeout) as server:
            server.ehlo()
            if cfg.use_tls:
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()
            if cfg.username:
                server.login(cfg.username, cfg.password or "")
            server.send_message(msg)

    logger.info("Email sent to %s subject=%s", to_email, subject)


def try_send_email(
    db: Session,
    *,
    to_email: str | None,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Best-effort send; logs failures and never raises."""
    if not to_email:
        return False
    try:
        send_email(
            db,
            to_email=to_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
        return True
    except Exception as exc:
        logger.warning("Email not sent to %s (%s): %s", to_email, subject, exc)
        return False


def _send_content(db: Session, *, to_email: str | None, content: templates.EmailContent) -> bool:
    return try_send_email(
        db,
        to_email=to_email,
        subject=content.subject,
        body_text=content.body_text,
        body_html=content.body_html,
    )


# --- Registration -----------------------------------------------------------

def send_consumer_registration(db: Session, *, to_email: str | None, full_name: str) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.registration_consumer(full_name=full_name, login_url=_login_url()),
    )


def send_provider_registration_pending(
    db: Session, *, to_email: str | None, full_name: str
) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.registration_provider(full_name=full_name, login_url=_login_url()),
    )


def send_customer_service_registration(
    db: Session,
    *,
    to_email: str | None,
    full_name: str,
    approved: bool,
) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.registration_customer_service(
            full_name=full_name,
            login_url=_login_url(),
            approved=approved,
        ),
    )


# --- Provider status --------------------------------------------------------

def send_provider_approved(db: Session, *, to_email: str | None, full_name: str) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.provider_approved(full_name=full_name, login_url=_login_url()),
    )


def send_provider_reapproved(db: Session, *, to_email: str | None, full_name: str) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.provider_reapproved(full_name=full_name, login_url=_login_url()),
    )


def send_provider_revoked(db: Session, *, to_email: str | None, full_name: str) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.provider_revoked(full_name=full_name, login_url=_login_url()),
    )


# --- Password reset ---------------------------------------------------------

def send_password_reset(
    db: Session,
    *,
    to_email: str | None,
    full_name: str,
    reset_url: str,
    expires_minutes: int,
    role: str = "CONSUMER",
) -> bool:
    return _send_content(
        db,
        to_email=to_email,
        content=templates.password_reset(
            role=role,
            full_name=full_name,
            reset_url=reset_url,
            expires_minutes=expires_minutes,
        ),
    )
