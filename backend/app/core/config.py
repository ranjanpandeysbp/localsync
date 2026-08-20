import os
import sys
import urllib.parse
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _detect_is_prod() -> bool:
    """Check CLI flags or environment variables for production mode."""
    argv = [arg.lower() for arg in sys.argv]
    if any(arg in argv for arg in ("prod", "--prod", "-p", "production", "--production")):
        return True
    for i, arg in enumerate(argv):
        if arg in ("--env", "-e", "--mode", "-m") and i + 1 < len(argv):
            if argv[i + 1] in ("prod", "production"):
                return True
        if arg.startswith(("--env=", "--mode=", "env=", "mode=")):
            val = arg.split("=", 1)[1].strip()
            if val in ("prod", "production"):
                return True

    env_val = (
        os.getenv("APP_ENV")
        or os.getenv("ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("MODE")
        or os.getenv("APP_MODE")
        or ""
    ).lower().strip()
    if env_val in ("prod", "production"):
        return True
    if os.getenv("PROD", "").lower().strip() in ("1", "true", "yes"):
        return True
    return False


def _detect_no_docker() -> bool:
    """Check CLI flags or environment variables for nodocker mode."""
    argv = [arg.lower() for arg in sys.argv]
    if any(arg in argv for arg in ("nodocker", "--nodocker", "-nd", "no-docker", "--no-docker")):
        return True
    for i, arg in enumerate(argv):
        if arg in ("--nodocker", "-nd") and i + 1 < len(argv):
            if argv[i + 1] in ("true", "1", "yes"):
                return True
        if arg.startswith(("--nodocker=", "nodocker=")):
            val = arg.split("=", 1)[1].strip()
            if val in ("true", "1", "yes"):
                return True

    env_val = (
        os.getenv("NODOCKER")
        or os.getenv("NO_DOCKER")
        or ""
    ).lower().strip()
    if env_val in ("true", "1", "yes"):
        return True
    return False


# Determine backend directory and .env location
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE_PATH = BACKEND_DIR / ".env"
DEFAULT_SQLITE_PATH = BACKEND_DIR / "localsync.db"

IS_PROD_MODE = _detect_is_prod()
IS_NODOCKER = _detect_no_docker()

# Default Hostinger MySQL production parameters
DEFAULT_PROD_DB_HOST = "srv1953.hstgr.io"
DEFAULT_PROD_DB_PORT = "3306"
DEFAULT_PROD_DB_USER = "u554759618_tradesetup"
DEFAULT_PROD_DB_PASS = "oO3O3N4:a?"
DEFAULT_PROD_DB_NAME = "u554759618_tradesetup"

# Build default database URL based on mode
if IS_PROD_MODE or IS_NODOCKER:
    db_host = os.getenv("DB_HOST", DEFAULT_PROD_DB_HOST)
    db_port = os.getenv("DB_PORT", DEFAULT_PROD_DB_PORT)
    db_user = os.getenv("DB_USER", DEFAULT_PROD_DB_USER)
    db_pass = os.getenv("DB_PASSWORD", DEFAULT_PROD_DB_PASS)
    db_name = os.getenv("DB_NAME", DEFAULT_PROD_DB_NAME)
    encoded_user = urllib.parse.quote_plus(db_user)
    encoded_pass = urllib.parse.quote_plus(db_pass)
    DEFAULT_DATABASE_URL = (
        f"mysql+pymysql://{encoded_user}:{encoded_pass}@{db_host}:{db_port}/{db_name}?charset=utf8mb4"
    )
else:
    DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH) if ((IS_PROD_MODE or IS_NODOCKER) and ENV_FILE_PATH.exists()) else None,
        extra="ignore",
    )

    app_name: str = "KoshalKarobar"
    app_env: str = "production" if IS_PROD_MODE else "development"
    is_prod: bool = IS_PROD_MODE
    is_nodocker: bool = IS_NODOCKER
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me-in-production-koshalkarobar-secret"
    algorithm: str = "HS256"
    frontend_url: str = "http://localhost:5173"
    password_reset_expire_minutes: int = 30
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = DEFAULT_DATABASE_URL
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_search_radius_km: int = 5
    city_search_radius_km: int = 30
    max_search_radius_km: int = 50
    request_expire_after_days: int = 30
    upload_dir: str = "uploads"
    max_upload_bytes: int = 8 * 1024 * 1024  # 8 MB
    max_attachments_per_entity: int = 5

    # Fast2SMS (https://www.fast2sms.com). When api_key is set, self-register
    # and forgot-password require a mobile OTP. Leave blank for local/demo.
    fast2sms_api_key: str = ""
    fast2sms_otp_id: str = ""
    fast2sms_otp_expiry_minutes: int = 10
    otp_resend_seconds: int = 60
    otp_max_per_hour: int = 5

    @property
    def sms_enabled(self) -> bool:
        return bool(self.fast2sms_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_upload_types(self) -> set[str]:
        return {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf",
        }


settings = Settings()

