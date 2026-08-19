# Hostinger Deployment Guide

This guide details the deployment of **KoshalKarobar** (React/Vite Frontend + FastAPI/Uvicorn Backend + SQLite/PostgreSQL Database + Redis) on **Hostinger**.

Since the application requires a Python backend, Redis service, and background workers, deploying on a **Hostinger VPS** (Virtual Private Server) is the highly recommended and standard approach. Alternatively, you can deploy the static Frontend on **Hostinger Shared Hosting** and host the Backend API separately on a VPS.

---

## Option 1: Full Stack Deployment on Hostinger VPS (Recommended)

Hostinger VPS runs Linux (Ubuntu is recommended). This option uses **Docker Compose** or standard **Systemd + Nginx** services to host both the frontend and backend on the same server.

### 1. Server Prerequisites
1. Purchase a **Hostinger KVM VPS Plan** (KVM 1 or KVM 2 with Ubuntu 22.04 LTS/24.04 LTS is perfect).
2. Point your domain or subdomains to your Hostinger VPS IP address:
   * `koshalkarobar.in` $\rightarrow$ Point A record to VPS IP (Frontend)
   * `api.koshalkarobar.in` $\rightarrow$ Point A record to VPS IP (Backend API)

---

### Step 2: System Installation & Dependencies
SSH into your Hostinger VPS (`ssh root@your_vps_ip`) and run:
```bash
# Update packages
apt update && apt upgrade -y

# Install git, nginx, curl, python3-pip, python3-venv, certbot, python3-certbot-nginx
apt install -y git nginx curl python3-pip python3-venv certbot python3-certbot-nginx

# Install Docker & Docker Compose (Recommended deployment route)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install -y docker-compose-plugin
```

---

### Step 3: Clone Code & Configure Env Variables
Clone your repository into the `/var/www/localsync` directory:
```bash
git clone https://github.com/your-repo/localsync.git /var/www/localsync
cd /var/www/localsync
```

Create a production environment file for the backend in `/var/www/localsync/backend/.env`:
```ini
APP_ENV=production
SECRET_KEY=generate-a-secure-random-string-here
FRONTEND_URL=https://koshalkarobar.in
CORS_ORIGIN_LIST=https://koshalkarobar.in,https://www.koshalkarobar.in
DATABASE_URL=sqlite:////var/www/localsync/backend/localsync.db
REDIS_URL=redis://localhost:6379/0
UPLOAD_DIR=/var/www/localsync/backend/media
```

Create a production build env file for the frontend in `/var/www/localsync/frontend/.env.production`:
```ini
VITE_API_URL=https://api.koshalkarobar.in/api/v1
```

---

### Step 4: Build & Host static Frontend via Nginx
Build the React/Vite assets on the VPS or upload them:
```bash
cd /var/www/localsync/frontend
npm install
npm run build
```
This builds static files into `/var/www/localsync/frontend/dist`.

---

### Step 5: Configure Backend Python Service (Systemd)
Create a Python virtual environment and install backend requirements:
```bash
cd /var/www/localsync/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create a systemd unit file to manage the FastAPI uvicorn daemon:
```bash
nano /etc/systemd/system/koshalkarobar-api.service
```

Paste the following configuration:
```ini
[Unit]
Description=KoshalKarobar FastAPI Backend Daemon
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/localsync/backend
ExecStart=/var/www/localsync/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always
Environment=PATH=/var/www/localsync/backend/venv/bin:/usr/bin:/usr/local/bin
EnvironmentFile=/var/www/localsync/backend/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the backend service:
```bash
systemctl daemon-reload
systemctl enable koshalkarobar-api
systemctl start koshalkarobar-api
systemctl status koshalkarobar-api
```

---

### Step 6: Install & Run Redis
Redis is required for session caching and pub/sub:
```bash
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
```

---

### Step 7: Nginx Configuration (Reverse Proxy & Static Files)
Create an Nginx configuration file to serve static files and proxy API requests:
```bash
nano /etc/nginx/sites-available/koshalkarobar
```

Paste the following server blocks:
```nginx
# 1. Frontend Server Configuration
server {
    listen 80;
    server_name koshalkarobar.in www.koshalkarobar.in;

    root /var/www/localsync/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Serve uploads media directly from the backend media folder
    location /media/ {
        alias /var/www/localsync/backend/media/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}

# 2. Backend API Server Configuration
server {
    listen 80;
    server_name api.koshalkarobar.in;

    client_max_body_size 10M; # Support uploads up to 5MB

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration and restart Nginx:
```bash
ln -s /etc/nginx/sites-available/koshalkarobar /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

### Step 8: SSL Certification (HTTPS)
Use Certbot to automatically configure SSL certificates for both domains:
```bash
certbot --nginx -d koshalkarobar.in -d www.koshalkarobar.in -d api.koshalkarobar.in
```
Follow the interactive prompts to enable automatic HTTPS redirects.

---

## Option 2: Deploy Frontend on Hostinger Shared Hosting + Backend on VPS

If you have a Hostinger Shared Hosting plan (e.g. Premium or Business Shared Hosting) and wish to host the static frontend on the shared hPanel, use this setup.

### 1. Build and Upload the Frontend
1. On your local machine, configure `frontend/.env.production` with your live API URL:
   ```ini
   VITE_API_URL=https://api.yourvpsdomain.com/api/v1
   ```
2. Build the project locally:
   ```bash
   npm run build
   ```
3. Compress the contents of the `frontend/dist/` directory into a `.zip` file.
4. Log into **Hostinger hPanel** $\rightarrow$ **File Manager** $\rightarrow$ Navigate to `public_html`.
5. Upload the `.zip` file and extract it directly inside `public_html`.
6. To support React Router client-side routing on Hostinger Shared Hosting, create a `.htaccess` file inside `public_html` with the following rewrite rule:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

### 2. Deploy Backend on VPS
Deploy the FastAPI backend on a separate VPS following **Step 5** and **Step 7 (Backend API Server Configuration)** from Option 1. Make sure `CORS_ORIGIN_LIST` in the backend `.env` includes your Hostinger Shared Hosting domain.

---

## post-deployment configuration

Once deployed, log into the **Admin Panel** at `https://koshalkarobar.in/admin` (using the seeded Admin credentials or creation routes) and configure the following services:

1. **SMTP Configuration**: Under **Config $\rightarrow$ SMTP**, configure your mail server host, port (e.g., 465/587), from-address, and SMTP password.
2. **Support Contacts**: Under **Config $\rightarrow$ Support Contact**, configure the recipient email address for inquiries sent through the "Contact Us" form (defaults to `support@koshalkarobar.in`).
3. **OTP SMS Configuration**: Under **Config $\rightarrow$ Fast2SMS**, configure the Fast2SMS API key, template IDs, and rate limits to enable mobile login OTP.
