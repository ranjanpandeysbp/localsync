"""Load and render SahiLocal transactional email templates.

Templates live under ``html/`` and ``text/``. Placeholders use ``{{name}}`` syntax.
HTML bodies are wrapped with ``_layout.html``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent
HTML_DIR = TEMPLATES_DIR / "html"
TEXT_DIR = TEMPLATES_DIR / "text"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    body_text: str
    body_html: str


def _fill(raw: str, values: dict[str, str]) -> str:
    # Manual replace so CSS braces in the layout stay intact.
    out = raw
    for key, value in values.items():
        out = out.replace(f"{{{{{key}}}}}", value)
    return out


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def render_template(template_key: str, *, subject: str, **values: str) -> EmailContent:
    """Render text + HTML for ``template_key`` (filename without extension)."""
    ctx = {k: str(v) for k, v in values.items()}
    text_path = TEXT_DIR / f"{template_key}.txt"
    html_path = HTML_DIR / f"{template_key}.html"
    layout_path = HTML_DIR / "_layout.html"

    body_text = _fill(_read(text_path), ctx)
    inner_html = _fill(_read(html_path), ctx)
    body_html = _fill(
        _read(layout_path),
        {
            **ctx,
            "subject": subject,
            "body": inner_html,
        },
    )
    return EmailContent(subject=subject, body_text=body_text, body_html=body_html)


# --- Registration -----------------------------------------------------------

def registration_consumer(*, full_name: str, login_url: str) -> EmailContent:
    return render_template(
        "registration_consumer",
        subject="Welcome to SahiLocal",
        full_name=full_name,
        login_url=login_url,
    )


def registration_provider(*, full_name: str, login_url: str) -> EmailContent:
    return render_template(
        "registration_provider",
        subject="Thank you for registering with SahiLocal",
        full_name=full_name,
        login_url=login_url,
    )


def registration_customer_service(
    *,
    full_name: str,
    login_url: str,
    approved: bool,
) -> EmailContent:
    if approved:
        return render_template(
            "registration_customer_service_approved",
            subject="Your SahiLocal customer service account is ready",
            full_name=full_name,
            login_url=login_url,
        )
    return render_template(
        "registration_customer_service_pending",
        subject="Your SahiLocal customer service account was created",
        full_name=full_name,
        login_url=login_url,
    )


# --- Provider status --------------------------------------------------------

def provider_approved(*, full_name: str, login_url: str) -> EmailContent:
    return render_template(
        "provider_approved",
        subject="Congratulations — your SahiLocal provider account is approved",
        full_name=full_name,
        login_url=login_url,
    )


def provider_revoked(*, full_name: str, login_url: str) -> EmailContent:
    return render_template(
        "provider_revoked",
        subject="Your SahiLocal provider account has been revoked",
        full_name=full_name,
        login_url=login_url,
    )


def provider_reapproved(*, full_name: str, login_url: str) -> EmailContent:
    return render_template(
        "provider_reapproved",
        subject="Your SahiLocal provider account has been re-approved",
        full_name=full_name,
        login_url=login_url,
    )


# --- Password reset (per role) ----------------------------------------------

_PASSWORD_RESET_SUBJECT = {
    "CONSUMER": "Reset your SahiLocal password",
    "PROVIDER": "Reset your SahiLocal provider password",
    "CUSTOMER_SERVICE": "Reset your SahiLocal customer service password",
    "ADMIN": "Reset your SahiLocal admin password",
}

_PASSWORD_RESET_TEMPLATE = {
    "CONSUMER": "password_reset_consumer",
    "PROVIDER": "password_reset_provider",
    "CUSTOMER_SERVICE": "password_reset_customer_service",
    "ADMIN": "password_reset_admin",
}


def password_reset(
    *,
    role: str,
    full_name: str,
    reset_url: str,
    expires_minutes: int,
) -> EmailContent:
    role_key = (role or "CONSUMER").upper()
    template_key = _PASSWORD_RESET_TEMPLATE.get(role_key, "password_reset_consumer")
    subject = _PASSWORD_RESET_SUBJECT.get(role_key, _PASSWORD_RESET_SUBJECT["CONSUMER"])
    return render_template(
        template_key,
        subject=subject,
        full_name=full_name,
        reset_url=reset_url,
        expires_minutes=str(expires_minutes),
    )
