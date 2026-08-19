from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.router import api_router
from app.api.routes import ws
from app.core.config import settings
from app.db import models  # noqa: F401
from app.db.session import Base, SessionLocal, engine, ensure_postgis
from app.services.redis_pubsub import redis_pubsub
from app.services.slugs import allocate_public_slug
from app.services.uploads import ensure_upload_dir


def _backfill_provider_public_slugs() -> None:
    from app.db.models import ProviderProfile

    db = SessionLocal()
    try:
        missing = (
            db.query(ProviderProfile)
            .filter(
                (ProviderProfile.public_slug.is_(None))
                | (ProviderProfile.public_slug == "")
            )
            .all()
        )
        for profile in missing:
            profile.public_slug = allocate_public_slug(
                db, profile.business_name, exclude_profile_id=profile.id
            )
        if missing:
            db.commit()
            print(f"[startup] backfilled public_slug for {len(missing)} provider(s)")
    except Exception as exc:
        db.rollback()
        print(f"[startup] public_slug backfill failed: {exc}")
    finally:
        db.close()


def _run_startup_migrations() -> None:
    """Idempotent schema tweaks. Uses dialect-safe schema creation."""
    with engine.connect() as conn:
        dialect_name = conn.dialect.name
        print(f"[startup] Running with database: {dialect_name.upper()} ({settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url})")
        print(f"[startup] Application Mode: {settings.app_env.upper()}")

        # Autocommit so DDL doesn't hold a long transaction across reloads
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        ensure_postgis(conn)
        Base.metadata.create_all(bind=conn)

        # Idempotent support_email addition for all database dialects (SQLite/PostgreSQL)
        try:
            conn.execute(text("ALTER TABLE app_smtp_config ADD COLUMN support_email VARCHAR(255) DEFAULT 'support@koshalkarobar.in'"))
        except Exception:
            pass

        # Only run PostgreSQL-specific DDL migrations when on PostgreSQL
        if dialect_name == "postgresql":
            try:
                conn.execute(text("SET lock_timeout = '3s'"))
                conn.execute(text("SET statement_timeout = '15s'"))
            except Exception:
                pass

            for stmt in (
                "CREATE INDEX IF NOT EXISTS idx_provider_location ON provider_profiles USING GIST (base_location)",
                "CREATE INDEX IF NOT EXISTS idx_request_location ON service_requests USING GIST (request_location)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS location_label VARCHAR(255)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION",
                "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE",
                "ALTER TABLE categories ALTER COLUMN name TYPE VARCHAR(255)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS offerings_detail TEXT",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS opening_time VARCHAR(5)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS closing_time VARCHAR(5)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS gst_number VARCHAR(30)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS pincode VARCHAR(12)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS gst_doc_url VARCHAR(500)",
                "ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS request_pincode VARCHAR(12)",

                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS website_url VARCHAR(500)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(500)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS public_slug VARCHAR(100)",
                "ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS provider_last_read_at TIMESTAMPTZ",
                "ALTER TABLE admin_conversations ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS consumer_last_read_at TIMESTAMPTZ",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS provider_last_read_at TIMESTAMPTZ",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_photo_url VARCHAR(500)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_latitude DOUBLE PRECISION",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_longitude DOUBLE PRECISION",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_location_label VARCHAR(255)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_status VARCHAR(32)",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_captured_at TIMESTAMPTZ",
                "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS ekyc_video_requested_at TIMESTAMPTZ",
                "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS consumer_seen_at TIMESTAMPTZ",
            ):
                try:
                    conn.execute(text(stmt))
                except Exception as exc:
                    print(f"[startup] skip: {stmt[:60]}… ({exc})")


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_upload_dir()
    try:
        _run_startup_migrations()
        _backfill_provider_public_slugs()
        from app.services.category_catalog import ensure_marketplace_categories
        from app.services.request_expiry import apply_request_expiry

        db = SessionLocal()
        try:
            n_cats = ensure_marketplace_categories(db)
            db.commit()
            print(f"[startup] marketplace categories ready ({n_cats})")
        except Exception as exc:
            db.rollback()
            print(f"[startup] marketplace categories failed: {exc}")
        finally:
            db.close()

        db = SessionLocal()
        try:
            n = apply_request_expiry(db)
            if n:
                print(f"[startup] expired {n} stale unlocked request(s)")
        finally:
            db.close()
    except Exception as exc:
        # Never block the API forever on migration issues
        print(f"[startup] migration failed (continuing): {exc}")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(upload_path)), name="media")

app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(ws.router)


@app.get("/health")
def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            if conn.dialect.name == "postgresql":
                try:
                    conn.execute(text("SET statement_timeout = '2s'"))
                except Exception:
                    pass
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as exc:
        print(f"[health] DB check failed: {exc}")
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "mode": settings.app_env,
        "dialect": engine.dialect.name,
        "redis": redis_pubsub.ping(),
    }

