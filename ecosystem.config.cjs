// PM2 Ecosystem Config � KoshalKarobar
// Usage:
//   pm2 start ecosystem.config.cjs          # start all apps
//   pm2 restart ecosystem.config.cjs        # restart all apps
//   pm2 stop ecosystem.config.cjs           # stop all apps
//   pm2 logs                                # tail all logs
//   pm2 save && pm2 startup                 # survive reboots

const path = require("path");

const ROOT = __dirname;                        // repo root
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");

// Resolve python from venv if it exists, else system python3
const PYTHON = path.join(BACKEND, ".venv", "bin", "python3");

module.exports = {
  apps: [
    // -------------------------------------------------
    // 1.  FastAPI Backend  (uvicorn, port 2025)
    // -------------------------------------------------
    {
      name: "localsync-api",
      cwd: BACKEND,

      // Run uvicorn directly � more stable under PM2 than run.py with --reload
      script: PYTHON,
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 2025 --workers 2",

      interpreter: "none",   // script is already a full executable path

      env: {
        NODOCKER: "1",
        PORT: "2025",
        APP_ENV: "production",
        PROD: "1",
        // DATABASE_URL: "mysql+pymysql://user:pass@host:3306/dbname"
        // SECRET_KEY: "your-secret"
        // CORS_ORIGINS: "https://yourdomain.com"
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      out_file: path.join(ROOT, "logs", "api-out.log"),
      error_file: path.join(ROOT, "logs", "api-err.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },

    // -------------------------------------------------
    // 2.  React / Vite Frontend  (vite preview, port 5173)
    //     Serves the production build from frontend/dist/
    //     Run `npm run build` inside frontend/ before starting.
    // -------------------------------------------------
    {
      name: "localsync-web",
      cwd: FRONTEND,

      script: "npm",
      args: "run preview",

      interpreter: "none",

      env: {
        NODE_ENV: "production",
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "256M",

      out_file: path.join(ROOT, "logs", "web-out.log"),
      error_file: path.join(ROOT, "logs", "web-err.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
