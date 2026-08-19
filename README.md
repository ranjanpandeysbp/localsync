# KoshalCity — How to Start Frontend & Backend

## Database Modes

KoshalCity supports two runtime database modes:
1. **Default Mode (SQLite)**: Zero setup required! Runs on a local SQLite database (`backend/localsync.db`). Docker is completely optional.
2. **Production Mode (MySQL)**: Connects to the production MySQL database (`srv1953.hstgr.io`) or uses configuration from `.env`.

---

## Backend (FastAPI) — port 8000

Open a terminal in `backend/`:

### First time setup

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

### Running the Backend

#### Option A: Default Mode (SQLite — Instant Local Dev)

```bash
# Seed the default SQLite database (only needed once)
python run.py --seed

# Start the API server in default SQLite mode
python run.py
```

Or using uvicorn directly:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Option B: Production Mode (MySQL / .env)

Pass `prod` or `--prod` flag on startup:

```bash
# Seed the production MySQL database
python run.py --seed --prod

# Start the API server in production MySQL mode
python run.py prod
```

Or using environment variable / uvicorn:
```bash
# Pass APP_ENV=production or --prod
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 prod
```

**Backend URLs**

- API docs: http://127.0.0.1:8000/docs  
- Health check: http://127.0.0.1:8000/health (shows active database engine & mode)

Leave this terminal open while developing.

---

## Frontend (React / Vite) — port 5173

Open a **second** terminal:

### First time

```bash
cd frontend
npm install
npm run dev
```

### Every other time

```bash
cd frontend
npm run dev
```

**Frontend URL:** http://localhost:5173  

Leave this terminal open while developing.

---

## Quick checklist

| Mode | Backend Command | Database Target | Ready when |
|------|-----------------|-----------------|------------|
| **Default (SQLite)** | `python run.py` | `localsync.db` (local file) | http://127.0.0.1:8000/docs loads |
| **Prod (MySQL)** | `python run.py prod` | Hostinger MySQL (`srv1953.hstgr.io`) | http://127.0.0.1:8000/docs loads |
| **Frontend** | `npm run dev` | Talks to backend on port 8000 | http://localhost:5173 loads |


Start order: **Docker → Backend → Frontend**.

---

## Fast2SMS (register + forgot-password OTP)

Configure Fast2SMS in **Admin → Config → Fast2SMS** (API key, OTP template id, sender, limits, test OTP). The key is never returned on GET.

Env vars below only **seed the first row** if the database has no SMS config yet:

```
FAST2SMS_API_KEY=your_api_key
FAST2SMS_OTP_ID=          # optional; DLT / Smart OTP template id. Blank uses Fast2SMS route=otp
FAST2SMS_OTP_EXPIRY_MINUTES=10
```

`GET /api/v1/auth/sms-status` reports `{ "enabled": true }` when Fast2SMS is enabled in Config and an API key is saved.

- **Register:** Create account → OTP SMS → Verify & create. Without Fast2SMS, a one-time demo OTP is returned for local testing.
- **Forgot password:** Phone → OTP → new password when SMS is enabled; otherwise email-link (SMTP).

Get a key at https://www.fast2sms.com — Dev / API settings.

---

## Demo logins

| Role | Phone | Password |
|------|-------|----------|
| Consumer | `9000000002` | `consumer123` |
| Provider | `9000000003` | `provider123` |
| Admin | `9000000001` | `admin123` |
| Customer service | `9000000004` | `support123` |

### Attachments

Consumers can attach **images or PDFs** when posting a request.  
Providers can attach **images or PDFs** (catalog / proof) when submitting a quote.  
Limits: up to **5 files**, **8 MB** each · JPEG, PNG, WebP, GIF, PDF.

### Browse & pre-request chat

1. On the consumer dashboard, pick a **category or subcategory**.
2. See providers in **Online** / **Offline** tabs (offerings, hours, GST, Maps link).
3. Click **Chat & ask** on an **online** provider to inquire before posting a request.
4. Providers reply from their **Consumer inquiries** panel.

## Summary
Registration is now minimal (name, mobile, password, role + GPS). Address, contact, GST/Aadhaar and documents live on **My profile** (`/profile`).

Hard-refresh the app, open **Register**, allow location, then finish details under **My profile**.


---

## Stop

- Frontend / Backend: `Ctrl+C` in each terminal  
- Database: `docker compose down` (from repo root)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| BE can’t connect to DB | Run `docker compose up -d` and wait for healthy |
| FE blank / API errors | Confirm BE is running on port **8000** |
| Docker errors | Open Docker Desktop, wait until fully started, retry |
