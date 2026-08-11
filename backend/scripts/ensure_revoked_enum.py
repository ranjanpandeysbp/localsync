from sqlalchemy import create_engine, text
from app.core.config import settings

engine = create_engine(settings.database_url)
with engine.connect() as conn:
    conn = conn.execution_options(isolation_level="AUTOCOMMIT")
    rows = conn.execute(
        text(
            """
            SELECT e.enumlabel FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'verification_status'
            ORDER BY e.enumsortorder
            """
        )
    ).fetchall()
    labels = [r[0] for r in rows]
    print("enum:", labels)
    if "REVOKED" not in labels:
        conn.execute(text("ALTER TYPE verification_status ADD VALUE 'REVOKED'"))
        print("added REVOKED")
    counts = conn.execute(
        text("SELECT verification_status::text, count(*) FROM provider_profiles GROUP BY 1")
    ).fetchall()
    print("counts:", counts)
