# Local Installation & Setup Guide
## Strata WMS

---

## 1. Prerequisites

- **PHP** `8.1+` (`8.1`–`8.3`) with extensions: `pdo_mysql`, `bcmath`, `mbstring`, `intl`, `gd`, `openssl`, `fileinfo`
- **Composer** `2.6+`
- **MySQL** `8.0+` (InnoDB)
- **Node.js** `20+` (`v22` recommended) & **npm** `10+`
- *(Optional)* **Docker Desktop** if running via `docker-compose.yml`

---

## 2. Option A — Native Local Setup (Laragon / Windows / macOS / Linux)

### Step 1: Create the MySQL Database
Log in to your local MySQL 8.0 server and create the database:

```sql
CREATE DATABASE strata_wms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE strata_wms_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2: Configure & Migrate the Laravel Backend
```powershell
cd backend
Copy-Item .env.example .env
```

Open `backend/.env` and set your local MySQL credentials:
```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=strata_wms
DB_USERNAME=root
DB_PASSWORD=your_mysql_password

SEED_DEMO_DATA=true
```

Generate the application key, link public storage (for product images), run migrations, and seed roles + realistic demo operations:
```powershell
php artisan key:generate
php artisan storage:link
php artisan migrate --seed
```

Start the API server on `http://127.0.0.1:8000`:
```powershell
php artisan serve --host=127.0.0.1 --port=8000
```

### Step 3: Start the React Frontend
Open a second terminal:
```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite automatically proxies `/api` and `/storage` requests to `http://127.0.0.1:8000`.

---

## 3. Option B — Docker Compose Setup

```powershell
docker compose up -d --build
docker exec -it strata_wms_backend php artisan key:generate
docker exec -it strata_wms_backend php artisan migrate --seed
```
- **Frontend UI**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000/api/v1/health`

---

## 4. Demo Accounts vs. Clean Production Bootstrap

- When `SEED_DEMO_DATA=true` (local development default), `DemoDatasetSeeder` populates 3 facilities (`WH-JKT-01`, `WH-SBY-02`, `WH-BDG-03`), 12 B2B SKUs, suppliers, POs, goods receipts, transfers, and adjustments:
  - **System Admin**: `admin@stratawms.io` / `Password123!`
  - **Warehouse Manager**: `manager@stratawms.io` / `Password123!`
  - **Warehouse Staff**: `staff@stratawms.io` / `Password123!`
- For a **clean production database** with zero demo records, set `SEED_DEMO_DATA=false` before running `php artisan migrate --seed`: only `CoreSystemSeeder` executes (roles, permissions, default settings, and initial admin).
