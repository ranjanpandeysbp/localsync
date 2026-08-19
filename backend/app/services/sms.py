"""Fast2SMS OTP delivery + local verification (hashed in Redis)."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import logging
import re
import secrets
from typing import Literal

import httpx
import redis
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppSmsConfig
from app.services.redis_pubsub import redis_pubsub

logger = logging.getLogger(__name__)

OTP_PURPOSE = Literal["register", "forgot_password"]

FAST2SMS_OTP_URL = "https://www.fast2sms.com/dev/otp/send"
FAST2SMS_BULK_URL = "https://www.fast2sms.com/dev/bulkV2"

PHONE_RE = re.compile(r"^\d{10}$")


class SmsError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class SmsRuntime:
    is_enabled: bool
    api_key: str
    otp_id: str
    sender_id: str
    otp_expiry_minutes: int
    resend_seconds: int
    max_per_hour: int

    @property
    def can_send(self) -> bool:
        return self.is_enabled and bool(self.api_key.strip())


def get_or_create_sms_config(db: Session) -> AppSmsConfig:
    row = db.get(AppSmsConfig, 1)
    if row:
        return row
    key = settings.fast2sms_api_key.strip() or None
    row = AppSmsConfig(
        id=1,
        is_enabled=bool(key),
        api_key=key,
        otp_id=settings.fast2sms_otp_id.strip() or None,
        sender_id=None,
        otp_expiry_minutes=max(1, settings.fast2sms_otp_expiry_minutes),
        resend_seconds=max(15, settings.otp_resend_seconds),
        max_per_hour=max(1, settings.otp_max_per_hour),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resolve_sms(db: Session) -> SmsRuntime:
    cfg = get_or_create_sms_config(db)
    return SmsRuntime(
        is_enabled=bool(cfg.is_enabled),
        api_key=(cfg.api_key or "").strip(),
        otp_id=(cfg.otp_id or "").strip(),
        sender_id=(cfg.sender_id or "").strip(),
        otp_expiry_minutes=max(1, cfg.otp_expiry_minutes or 10),
        resend_seconds=max(15, cfg.resend_seconds or 60),
        max_per_hour=max(1, cfg.max_per_hour or 5),
    )


def normalize_mobile(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not PHONE_RE.fullmatch(digits):
        raise SmsError("Enter a valid 10-digit Indian mobile number", status_code=400)
    return digits


def _otp_hash(purpose: str, mobile: str, otp: str) -> str:
    payload = f"{purpose}:{mobile}:{otp}".encode()
    return hmac.new(settings.secret_key.encode(), payload, hashlib.sha256).hexdigest()


def _code_key(purpose: str, mobile: str) -> str:
    return f"otp:code:{purpose}:{mobile}"


def _attempts_key(purpose: str, mobile: str) -> str:
    return f"otp:attempts:{purpose}:{mobile}"


def _cooldown_key(purpose: str, mobile: str) -> str:
    return f"otp:cooldown:{purpose}:{mobile}"


def _hourly_key(mobile: str) -> str:
    return f"otp:hour:{mobile}"


def _verified_key(purpose: str, mobile: str) -> str:
    return f"otp:verified:{purpose}:{mobile}"


def _enforce_send_limits(purpose: str, mobile: str, runtime: SmsRuntime) -> None:
    try:
        client = redis_pubsub.client
        cool = client.ttl(_cooldown_key(purpose, mobile))
        if cool and cool > 0:
            raise SmsError(
                f"Wait {cool} seconds before requesting another OTP",
                status_code=429,
            )
        hourly = int(client.get(_hourly_key(mobile)) or 0)
        if hourly >= runtime.max_per_hour:
            raise SmsError(
                "Too many OTP requests. Try again in an hour.",
                status_code=429,
            )
    except SmsError:
        raise
    except redis.RedisError:
        logger.warning("Redis unavailable; skipping OTP rate limit")


def _mark_sent(purpose: str, mobile: str, otp: str, runtime: SmsRuntime) -> None:
    ttl = max(60, runtime.otp_expiry_minutes * 60)
    digest = _otp_hash(purpose, mobile, otp)
    try:
        client = redis_pubsub.client
        client.setex(_code_key(purpose, mobile), ttl, digest)
        client.setex(_attempts_key(purpose, mobile), ttl, 0)
        client.setex(_cooldown_key(purpose, mobile), runtime.resend_seconds, "1")
        hour_key = _hourly_key(mobile)
        count = client.incr(hour_key)
        if count == 1:
            client.expire(hour_key, 3600)
    except redis.RedisError:
        logger.warning("Redis unavailable; OTP cannot be verified until Redis is up")
        raise SmsError("OTP service is temporarily unavailable", status_code=503)


def _generate_otp() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def _fast2sms_send(mobile: str, otp: str, runtime: SmsRuntime) -> None:
    key = runtime.api_key.strip()
    otp_id = runtime.otp_id.strip()
    timeout = 20.0
    try:
        if otp_id:
            response = httpx.post(
                FAST2SMS_OTP_URL,
                headers={"Authorization": key, "Content-Type": "application/json"},
                json={
                    "mobile": mobile,
                    "otp_id": otp_id,
                    "otp": otp,
                    "otp_length": 6,
                    "otp_expiry": runtime.otp_expiry_minutes,
                    "variables_values": "{otp}",
                },
                timeout=timeout,
            )
        else:
            params = {
                "authorization": key,
                "route": "otp",
                "variables_values": otp,
                "numbers": mobile,
                "flash": "0",
            }
            if runtime.sender_id:
                params["sender_id"] = runtime.sender_id
            response = httpx.get(
                FAST2SMS_BULK_URL,
                params=params,
                timeout=timeout,
            )
    except httpx.HTTPError as exc:
        logger.exception("Fast2SMS request failed")
        raise SmsError("Could not send OTP. Try again.") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    ok = bool(payload.get("return")) if isinstance(payload, dict) else False
    if response.status_code >= 400 or not ok:
        message = "Could not send OTP. Try again."
        if isinstance(payload, dict):
            raw = payload.get("message")
            if isinstance(raw, list) and raw:
                message = str(raw[0])
            elif isinstance(raw, str) and raw.strip():
                message = raw.strip()
        logger.warning(
            "Fast2SMS send failed status=%s body=%s",
            response.status_code,
            payload,
        )
        raise SmsError(message, status_code=502)

    logger.info("Fast2SMS OTP sent mobile=%s request_id=%s", mobile, payload.get("request_id"))


def send_otp(phone: str, purpose: OTP_PURPOSE, db: Session) -> tuple[str, str]:
    """Generate, store, and (when configured) deliver an OTP. Returns (mobile, otp)."""
    runtime = resolve_sms(db)
    mobile = normalize_mobile(phone)
    _enforce_send_limits(purpose, mobile, runtime)
    otp = _generate_otp()
    _mark_sent(purpose, mobile, otp, runtime)
    if runtime.can_send:
        try:
            _fast2sms_send(mobile, otp, runtime)
        except SmsError:
            try:
                client = redis_pubsub.client
                client.delete(
                    _code_key(purpose, mobile),
                    _attempts_key(purpose, mobile),
                    _cooldown_key(purpose, mobile),
                )
            except redis.RedisError:
                pass
            raise
    else:
        logger.info("Local demo OTP purpose=%s mobile=%s otp=%s", purpose, mobile, otp)
    return mobile, otp


def send_test_otp(db: Session, phone: str) -> str:
    """Send a one-off Fast2SMS OTP so admin can confirm delivery. Does not store the code."""
    runtime = resolve_sms(db)
    if not runtime.can_send:
        raise SmsError("Enable Fast2SMS and save an API key first", status_code=400)
    mobile = normalize_mobile(phone)
    otp = _generate_otp()
    _fast2sms_send(mobile, otp, runtime)
    return mobile


def verify_otp(phone: str, purpose: OTP_PURPOSE, otp: str) -> str:
    """Validate OTP and consume it. Returns normalized mobile on success."""
    mobile = normalize_mobile(phone)
    code = (otp or "").strip()
    if not re.fullmatch(r"\d{4,10}", code):
        raise SmsError("Enter the OTP sent to your mobile", status_code=400)
    try:
        client = redis_pubsub.client
        stored = client.get(_code_key(purpose, mobile))
        if not stored:
            raise SmsError("OTP expired or not found. Request a new one.", status_code=400)
        attempts = int(client.incr(_attempts_key(purpose, mobile)))
        if attempts > 5:
            client.delete(_code_key(purpose, mobile))
            raise SmsError("Too many incorrect attempts. Request a new OTP.", status_code=400)
        expected = _otp_hash(purpose, mobile, code)
        if not hmac.compare_digest(stored, expected):
            raise SmsError("Incorrect OTP", status_code=400)
        client.delete(_code_key(purpose, mobile), _attempts_key(purpose, mobile))
    except SmsError:
        raise
    except redis.RedisError as exc:
        raise SmsError("OTP service is temporarily unavailable", status_code=503) from exc
    return mobile


def mark_phone_verified(purpose: OTP_PURPOSE, mobile: str) -> None:
    """Allow register to proceed after OTP success while the user finishes the form."""
    ttl = max(15 * 60, settings.fast2sms_otp_expiry_minutes * 60 * 2)
    try:
        redis_pubsub.client.setex(_verified_key(purpose, mobile), ttl, "1")
    except redis.RedisError as exc:
        raise SmsError("OTP service is temporarily unavailable", status_code=503) from exc


def is_phone_verified(purpose: OTP_PURPOSE, mobile: str) -> bool:
    try:
        return bool(redis_pubsub.client.get(_verified_key(purpose, mobile)))
    except redis.RedisError as exc:
        raise SmsError("OTP service is temporarily unavailable", status_code=503) from exc


def clear_phone_verified(purpose: OTP_PURPOSE, mobile: str) -> None:
    try:
        redis_pubsub.client.delete(_verified_key(purpose, mobile))
    except redis.RedisError:
        pass
