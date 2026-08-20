"""KoshalKarobar Backend Runner

Convenient CLI runner to start the server or seed the database in
default (SQLite) or production (MySQL / .env) mode.

Usage:
  python run.py                    # Start server in default mode (SQLite)
  python run.py prod               # Start server in production mode (MySQL)
  python run.py --prod             # Start server in production mode (MySQL)
  python run.py --seed             # Seed SQLite database
  python run.py --seed --prod      # Seed MySQL production database
"""

import os
import sys
import uvicorn


def main():
    args = [a.lower() for a in sys.argv[1:]]

    is_prod = any(arg in args for arg in ("prod", "--prod", "-p", "production", "--production"))
    is_nodocker = any(arg in args for arg in ("nodocker", "--nodocker", "-nd", "no-docker", "--no-docker"))
    do_seed = any(arg in args for arg in ("seed", "--seed", "-s"))
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError:
        port = 8000
    host = os.environ.get("HOST", "0.0.0.0")

    # Find custom port or host if passed e.g. --port 8001 --host 127.0.0.1
    for i, arg in enumerate(args):
        if arg in ("--port", "-p") and i + 1 < len(args):
            try:
                port = int(args[i + 1])
            except ValueError:
                pass
        if arg.startswith("--port="):
            try:
                port = int(arg.split("=", 1)[1])
            except ValueError:
                pass
        if arg == "--host" and i + 1 < len(args):
            host = sys.argv[i + 2]
        if arg.startswith("--host="):
            host = sys.argv[i + 1].split("=", 1)[1]

    if is_nodocker:
        os.environ["NODOCKER"] = "1"

    if is_prod:
        os.environ["APP_ENV"] = "production"
        os.environ["PROD"] = "1"
        if is_nodocker:
            mode_label = "PRODUCTION (MySQL / .env) [NODOCKER: Redis Bypassed]"
        else:
            mode_label = "PRODUCTION (MySQL / .env)"
    else:
        if is_nodocker:
            mode_label = "NODOCKER (MySQL / .env) [Redis Bypassed]"
        else:
            mode_label = "DEFAULT (SQLite: localsync.db)"

    if do_seed:
        print(f"[*] Seeding database in {mode_label} mode...")
        from scripts.seed import seed
        seed()
        return

    print(f"[*] Starting KoshalKarobar API server in {mode_label} mode on http://{host}:{port}...")

    # Import settings to ensure validation
    from app.core.config import settings
    print(f"[*] Database URL: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    print(f"[*] Interactive docs available at: http://127.0.0.1:{port}/docs")

    uvicorn.run("app.main:app", host=host, port=port, reload=not is_prod)


if __name__ == "__main__":
    main()
