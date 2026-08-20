# KoshalKarobar — Start Guide

## Database Modes

| Mode | Database | When to use |
|------|----------|-------------|
| **Default (SQLite)** | `backend/localsync.db` (local file) | Local dev on Windows / macOS |
| **Production / nodocker** | Hostinger MySQL (`srv1953.hstgr.io`) | Ubuntu VPS / Shared hosting, no Docker |

---

## Local Development (Windows / macOS)

### 1 — Backend (FastAPI) — port 2025

```powershell
# Windows PowerShell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# SQLite (default, zero setup)
python run.py --port 2025

# MySQL / Hostinger (reads .env)
python run.py prod --nodocker --port 2025
```

```bash
# macOS / Linux
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python run.py --port 2025                    # SQLite
python run.py prod --nodocker --port 2025    # MySQL
```

**Useful flags:**

| Flag | Description |
|------|-------------|
| `--port 2025` | Run on a custom port (default: `8000`) |
| `--nodocker` | Skip Docker & Redis; use in-memory fallback + load `.env` |
| `prod` | Connect to Hostinger MySQL instead of SQLite |
| `--seed` | Seed the database then exit |

**Backend URLs (local)**
- API docs: http://127.0.0.1:2025/docs
- Health: http://127.0.0.1:2025/health

---

### 2 — Frontend (React / Vite) — port 5173

```bash
cd frontend
npm install
npm run dev      # dev server with hot reload → http://localhost:5173
```

> The Vite dev server proxies `/api`, `/ws`, and `/health` to `http://127.0.0.1:2025` automatically.

---

## Production Deployment on Hostinger Ubuntu (PM2)

### One-time server setup

```bash
# Install PM2 globally
npm install -g pm2

# Python venv + backend deps
cd ~/work/localsync/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Build React frontend
cd ~/work/localsync/frontend
rm -f package-lock.json        # remove Windows lock file if present
rm -rf node_modules            # clean Windows binaries
npm install                    # pulls correct Linux binaries
npm run build                  # outputs frontend/dist/

# Create logs directory
mkdir -p ~/work/localsync/logs
```

### Configure backend environment

Edit `backend/.env` (create if not present):

```ini
APP_ENV=production
NODOCKER=1
PORT=2025
SECRET_KEY=your-secret-key-here
DATABASE_URL=mysql+pymysql://u554759618_tradesetup:oO3O3N4%3Aa%3F@srv1953.hstgr.io:3306/u554759618_tradesetup?charset=utf8mb4
CORS_ORIGINS=http://YOUR_VPS_IP:5173,https://yourdomain.com
FAST2SMS_API_KEY=
```

### Start with PM2

```bash
cd ~/work/localsync
pm2 start ecosystem.config.cjs    # starts localsync-api (port 2025) + localsync-web (port 5173)
pm2 save                          # persist process list
pm2 startup                       # auto-start on reboot (follow the printed command)
```

### PM2 quick reference

```bash
pm2 list                          # show all running apps & status
pm2 logs                          # tail all logs
pm2 logs localsync-api            # backend logs only
pm2 logs localsync-web            # frontend logs only
pm2 restart ecosystem.config.cjs  # restart both apps
pm2 stop localsync-api            # stop backend only
pm2 monit                         # live CPU / memory dashboard
```

### Open firewall ports

```bash
ufw allow 2025    # FastAPI backend
ufw allow 5173    # React frontend
ufw reload
```

---

## Quick Reference

| What | URL |
|------|-----|
| React app | http://YOUR_IP:5173 |
| API docs (Swagger) | http://YOUR_IP:2025/docs |
| Health check | http://YOUR_IP:2025/health |

---

## Demo Logins

| Role | Phone | Password |
|------|-------|----------|
| Consumer | `9000000002` | `consumer123` |
| Provider | `9000000003` | `provider123` |
| Admin | `9000000001` | `admin123` |
| Customer service | `9000000004` | `support123` |

---

## Attachments

Consumers and Providers can attach **images or PDFs** to requests and quotes.
Limits: up to **5 files**, **8 MB** each · JPEG, PNG, WebP, GIF, PDF.

---

## Fast2SMS OTP

Configure in **Admin → Config → Fast2SMS**. Without a key, a demo OTP is printed to the console for local testing.

```ini
FAST2SMS_API_KEY=your_key
FAST2SMS_OTP_ID=          # optional DLT template id
FAST2SMS_OTP_EXPIRY_MINUTES=10
```

---

## Stop

```bash
pm2 stop ecosystem.config.cjs     # stop both apps on server
# or locally:
Ctrl+C                             # in each terminal
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm install` fails with `EBADPLATFORM` | `rm -rf node_modules package-lock.json && npm install` |
| Backend can't connect to MySQL | Check `DATABASE_URL` in `backend/.env` |
| FE blank / API 502 | Confirm backend is running: `pm2 list` |
| PM2 app keeps restarting | Check logs: `pm2 logs localsync-api --lines 50` |
| Port already in use | `pm2 stop all` then restart, or change `PORT` in `.env` |