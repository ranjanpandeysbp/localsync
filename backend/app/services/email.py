"""Transactional email using admin-configured SMTP settings."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.db.models import AppSmtpConfig

logger = logging.getLogger(__name__)


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


def send_provider_registration_pending(db: Session, *, to_email: str | None, full_name: str) -> bool:
    subject = "Thank you for registering with LocalSync"
    body_text = (
        f"Hi {full_name},\n\n"
        "Thank you for registration. Your account is being currently reviewed.\n"
        "Please keep checking email from us in next 24hrs.\n\n"
        "You will be able to log in after your account is approved.\n\n"
        "— LocalSync Team"
    )
    body_html = (
        f"<p>Hi {full_name},</p>"
        "<p>Thank you for registration. Your account is being currently reviewed.</p>"
        "<p>Please keep checking email from us in next 24hrs.</p>"
        "<p>You will be able to log in after your account is approved.</p>"
        "<p>— LocalSync Team</p>"
    )
    return try_send_email(
        db,
        to_email=to_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )


def send_provider_approved(db: Session, *, to_email: str | None, full_name: str) -> bool:
    subject = "Congratulations — your LocalSync account is approved"
    body_text = (
        f"Hi {full_name},\n\n"
        "Congratulations! Your account is approved and activated.\n\n"
        "You can log in and create your listing.\n\n"
        "— LocalSync Team"
    )
    body_html = (
        f"<p>Hi {full_name},</p>"
        "<p><strong>Congratulations!</strong> Your account is approved and activated.</p>"
        "<p>You can log in and create your listing.</p>"
        "<p>— LocalSync Team</p>"
    )
    return try_send_email(
        db,
        to_email=to_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )
