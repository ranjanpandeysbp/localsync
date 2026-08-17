from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "SahiLocal"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me-in-production-sahilocal-secret"
    algorithm: str = "HS256"
    frontend_url: str = "http://localhost:5173"
    password_reset_expire_minutes: int = 30
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "postgresql+psycopg2://localsync:localsync@localhost:5432/localsync"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_search_radius_km: int = 5
    city_search_radius_km: int = 30
    max_search_radius_km: int = 50
    request_expire_after_days: int = 30
    upload_dir: str = "uploads"
    max_upload_bytes: int = 8 * 1024 * 1024  # 8 MB
    max_attachments_per_entity: int = 5

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
