# Production Deployment, Security & Backup Guide
## Strata WMS

---

## 1. Production Environment Hardening (`backend/.env`)

Before deploying to production, enforce the following configuration in `backend/.env`:

```dotenv
APP_NAME="Strata WMS"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com

CORS_ALLOWED_ORIGINS=https://wms.yourdomain.com
SEED_DEMO_DATA=false

ADMIN_BOOTSTRAP_EMAIL=ops-admin@yourdomain.com
ADMIN_BOOTSTRAP_PASSWORD=<strong-unique-24-char-password>
```

> **Important**: Never deploy with `APP_DEBUG=true` or `SEED_DEMO_DATA=true`. Rotate the bootstrap administrator password immediately after initial sign-in.

---

## 2. Build & Optimization Pipeline

### 2.1 Backend Release Steps
```bash
cd backend
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan db:seed --class=CoreSystemSeeder --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan storage:link
```

### 2.2 Frontend Static Bundle Build
```bash
cd frontend
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1 npm run build
```
Serve `frontend/dist/` behind Nginx or Cloudflare/CDN with `try_files $uri $uri/ /index.html;` and TLS 1.3 enabled.

---

## 3. Reverse Proxy & Security Headers (Nginx)

Add the following headers to your production Nginx `server` block:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.yourdomain.com;" always;
```

---

## 4. Automated MySQL Backup & Point-in-Time Recovery Strategy

Because Strata WMS is an operational and financial inventory ledger, backups must use InnoDB consistent snapshots (`--single-transaction`) without locking warehouse floor operations:

### 4.1 Daily Encrypted Snapshot Cron (`/etc/cron.d/strata-wms-backup`)
```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="/var/backups/strata-wms/strata_wms_${TIMESTAMP}.sql.gz"

mysqldump \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  -u "${DB_BACKUP_USER}" -p"${DB_BACKUP_PASS}" strata_wms \
  | gzip -9 > "${BACKUP_FILE}"

# Prune local snapshots older than 14 days after offsite S3/GCS sync
find /var/backups/strata-wms -name "*.sql.gz" -mtime +14 -delete
```

### 4.2 Binary Logging (PITR)
Enable MySQL binary logging (`binlog_format = ROW`, `binlog_expire_logs_seconds = 604800`) on the production database instance to enable second-level Point-in-Time Recovery between daily snapshots.
