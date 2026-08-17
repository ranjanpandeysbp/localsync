# KoshalHaat — How to Start Frontend & Backend

## Prerequisites

1. **Docker Desktop** running  
2. **Python 3.11+**  
3. **Node.js 20+** / npm  

---

## 0. Start database (required once before BE)

From repo root (`localsync/`):

```bash
docker compose up -d
docker compose ps
```

Wait until `db` and `redis` show **healthy**.

---

## Backend (FastAPI) — port 8000

Open a terminal:

### First time

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m scripts.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**macOS / Linux:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Every other time

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend URLs**

- API docs: http://127.0.0.1:8000/docs  
- Health: http://127.0.0.1:8000/health  

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

| Step | Command | Ready when |
|------|---------|------------|
| DB + Redis | `docker compose up -d` | `docker compose ps` → healthy |
| Backend | `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | http://127.0.0.1:8000/docs loads |
| Frontend | `npm run dev` | http://localhost:5173 loads |

Start order: **Docker → Backend → Frontend**.

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
