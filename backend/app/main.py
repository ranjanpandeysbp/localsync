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
    """Idempotent schema tweaks. Uses short lock timeouts so reload never hangs forever."""
    with engine.connect() as conn:
        # Autocommit so DDL doesn't hold a long transaction across reloads
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        ensure_postgis(conn)
        Base.metadata.create_all(bind=conn)

        conn.execute(text("SET lock_timeout = '3s'"))
        conn.execute(text("SET statement_timeout = '15s'"))

        for stmt in (
            "CREATE INDEX IF NOT EXISTS idx_provider_location ON provider_profiles USING GIST (base_location)",
            "CREATE INDEX IF NOT EXISTS idx_request_location ON service_requests USING GIST (request_location)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS location_label VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION",
            "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE",
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
            "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12)",
            "ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS aadhaar_doc_url VARCHAR(500)",
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
        ):
            try:
                conn.execute(text(stmt))
            except Exception as exc:
                print(f"[startup] skip: {stmt[:60]}… ({exc})")

        try:
            conn.execute(
                text(
                    """
                    UPDATE conversations
                    SET consumer_last_read_at = COALESCE(consumer_last_read_at, updated_at, NOW()),
                        provider_last_read_at = COALESCE(provider_last_read_at, updated_at, NOW())
                    WHERE consumer_last_read_at IS NULL OR provider_last_read_at IS NULL
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] conversation last_read backfill: {exc}")

        try:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_profiles_public_slug "
                    "ON provider_profiles (public_slug) WHERE public_slug IS NOT NULL"
                )
            )
        except Exception as exc:
            print(f"[startup] public_slug index: {exc}")

        try:
            conn.execute(text("ALTER TABLE service_requests ALTER COLUMN request_location DROP NOT NULL"))
        except Exception as exc:
            print(f"[startup] request_location nullable: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status')
                         AND NOT EXISTS (
                           SELECT 1
                           FROM pg_enum e
                           JOIN pg_type t ON e.enumtypid = t.oid
                           WHERE t.typname = 'verification_status' AND e.enumlabel = 'REVOKED'
                         )
                      THEN
                        ALTER TYPE verification_status ADD VALUE 'REVOKED';
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] verification_status REVOKED: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status')
                         AND NOT EXISTS (
                           SELECT 1
                           FROM pg_enum e
                           JOIN pg_type t ON e.enumtypid = t.oid
                           WHERE t.typname = 'order_status' AND e.enumlabel = 'REJECTED'
                         )
                      THEN
                        ALTER TYPE order_status ADD VALUE 'REJECTED';
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] order_status REJECTED: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role')
                         AND NOT EXISTS (
                           SELECT 1
                           FROM pg_enum e
                           JOIN pg_type t ON e.enumtypid = t.oid
                           WHERE t.typname = 'user_role' AND e.enumlabel = 'CUSTOMER_SERVICE'
                         )
                      THEN
                        ALTER TYPE user_role ADD VALUE 'CUSTOMER_SERVICE';
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] user_role CUSTOMER_SERVICE: {exc}")

        try:
            conn.execute(text("ALTER TABLE provider_profiles ALTER COLUMN category_id DROP NOT NULL"))
        except Exception as exc:
            print(f"[startup] category_id nullable: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_kind') THEN
                        CREATE TYPE offer_kind AS ENUM ('PRODUCT', 'SERVICE', 'BOTH');
                      END IF;
                      IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'categories' AND column_name = 'kind'
                      ) THEN
                        ALTER TABLE categories ADD COLUMN kind offer_kind DEFAULT 'BOTH';
                      END IF;
                      IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'provider_profiles' AND column_name = 'offer_kind'
                      ) THEN
                        ALTER TABLE provider_profiles ADD COLUMN offer_kind offer_kind DEFAULT 'BOTH';
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] offer_kind: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_key'
                      ) THEN
                        ALTER TABLE categories DROP CONSTRAINT categories_name_key;
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] drop name unique: {exc}")

        try:
            conn.execute(
                text(
                    """
                    INSERT INTO provider_categories (provider_id, category_id)
                    SELECT id, category_id FROM provider_profiles
                    WHERE category_id IS NOT NULL
                    ON CONFLICT DO NOTHING
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] backfill provider_categories: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'quotes' AND column_name = 'estimated_minutes'
                      ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'quotes' AND column_name = 'estimated_days'
                      ) THEN
                        ALTER TABLE quotes RENAME COLUMN estimated_minutes TO estimated_days;
                        UPDATE quotes SET estimated_days = GREATEST(1, CEIL(estimated_days / 1440.0)::int)
                        WHERE estimated_days > 30;
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] eta rename: {exc}")

        try:
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_target_mode') THEN
                        CREATE TYPE request_target_mode AS ENUM ('BROADCAST', 'TARGETED');
                      END IF;
                      IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'service_requests' AND column_name = 'target_mode'
                      ) THEN
                        ALTER TABLE service_requests
                          ADD COLUMN target_mode request_target_mode DEFAULT 'BROADCAST';
                      END IF;
                      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode') THEN
                        CREATE TYPE payment_mode AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');
                      END IF;
                      IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'orders' AND column_name = 'payment_mode'
                      ) THEN
                        ALTER TABLE orders
                          ADD COLUMN payment_mode payment_mode DEFAULT 'CASH' NOT NULL;
                      END IF;
                    END $$;
                    """
                )
            )
        except Exception as exc:
            print(f"[startup] target/payment enums: {exc}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_upload_dir()
    try:
        _run_startup_migrations()
        _backfill_provider_public_slugs()
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
            conn.execute(text("SET statement_timeout = '2s'"))
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "redis": redis_pubsub.ping(),
    }
