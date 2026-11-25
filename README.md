# Strata WMS
### Enterprise Inventory & Multi-Warehouse Management System

Strata WMS is a commercial-grade, multi-facility Inventory & Warehouse Management System engineered with **React 18 + TypeScript + Tailwind CSS** and **Laravel 10 + MySQL 8.0**. Designed around an **immutable append-only stock movement ledger**, **row-level pessimistic concurrency locking**, and a **high-density operational interface**, it eliminates negative stock anomalies, untraceable shrinkage, and procurement blind spots.

---

## 🎯 Business Problems Solved

Traditional inventory spreadsheets and basic CRUD dashboards fail in fast-paced distribution environments:
1. **Untraceable Shrinkage & Inventory Discrepancies:** In basic systems, stock counts are arbitrarily overwritten. Strata WMS enforces an *immutable append-only ledger* where every single physical unit change is permanently attributed to a signed user, timestamp, and document reference.
2. **Overselling & Race Conditions:** When multiple warehouse staff dispatch items simultaneously, standard databases suffer race conditions. Strata WMS leverages deterministic slot ordering and InnoDB `SELECT ... FOR UPDATE` row locks to prevent negative inventory down to the millisecond.
3. **In-Transit Stock Disappearance:** When transferring stock between branches, items often vanish from records while in transit. Strata WMS implements a two-phase reservation protocol (`reserved_quantity`), ensuring stock is locked at the source until confirmed at the destination.
4. **Uncontrolled Procurement Spending:** Eliminates rogue purchasing through a strict multi-tier approval hierarchy (Staff Request → Manager Approval → Goods Receiving).

---

## ⚡ Key Engineering Highlights

- **Append-Only Inventory Ledger (`InventoryLedgerService`)**: Stock quantities (`inventory_stocks`) can never be edited arbitrarily—every mutation atomically records `balance_before`, `quantity_change`, `balance_after`, `unit_cost`, operator, and document reference in `stock_movements`.
- **Deadlock-Free Concurrency Control**: Multi-item receipts, outbound dispatches, and inter-warehouse transfers sort target `(warehouse_id, product_id, location_key)` slots deterministically before acquiring InnoDB `SELECT ... FOR UPDATE` row locks.
- **Pending Transfer Stock Reservation**: Initiating a transfer earmarks `reserved_quantity` at the source warehouse (`available = on_hand - reserved`) so concurrent outbound orders cannot oversell in-transit inventory.
- **Closed-Loop Procurement**: Suppliers → Multi-line Purchase Orders (`draft` / `approved` / `partially_received` / `completed`) → Partial or full Goods Receipts (`GRN`) that automatically increment warehouse stock.
- **Two-Tier Backend Authorization**: Combines granular RBAC permissions (`36` capabilities across `9` modules) with **Warehouse Assignment Scoping** (`user_warehouses`), validated in Laravel Policies and SQL scopes.
- **Idempotent Mutating APIs**: Supports `X-Idempotency-Key` headers stored in `idempotency_keys` to guarantee safe client retries without duplicate stock postings.
- **Enterprise Anti-AI-Slop Interface**: Crisp neutral palette (`#F7F8FA` canvas, `#FFFFFF` surface, `1px` `#E6E8EC` borders, `#334E85` deep navy accent), `tabular-nums` alignment across all quantities and financials, collapsible navigation, global facility context switcher, and zero decorative fluff.

---

## 📦 Core Modules & System Functionality

| Module | Route | Key Capabilities & Business Logic |
| :--- | :--- | :--- |
| **Operational Overview** | `/` | Executive real-time dashboard displaying total inventory valuation ($ Cost Basis), SKU counts, low stock alerts, in-transit transfers, daily inbound vs. outbound velocity charts, top moving SKUs, and pending approval queues. |
| **Inventory Balances** | `/inventory` | Central stock monitoring by warehouse and storage bin location. Filter by Healthy, Low Stock, or Zero Stock status with instant recalculation of available (`on_hand - reserved`) quantities. |
| **Product Catalog** | `/products` | Master product registry with SKU, name, category, unit of measure, barcode, cost basis, and minimum stock threshold. Protected by soft-deletion rules blocking archival of SKUs with non-zero stock. |
| **Warehouse Network** | `/warehouses` | Multi-facility management with internal storage location breakdown (Zone, Aisle, Shelf, Bin). Tracks active SKU count, total units, and aggregated facility valuation. |
| **Stock Movement Ledger** | `/stock-movements` | Immutable audit ledger functioning like a bank statement for inventory. Displays every verified Inbound, Outbound, Transfer, and Adjustment event with exact timestamps and operator IDs. |
| **Purchase Orders (Procurement)** | `/purchase-orders` | End-to-end procurement workflow: PO creation with vendor selection, unit costs, subtotal/tax calculation, manager approval gate, and progressive goods receipt processing (Partial & Full GRN). |
| **Suppliers Directory** | `/suppliers` | Vendor database tracking contact persons, business emails, payment terms, and historical procurement volume. |
| **Stock Transfers** | `/stock-transfers` | Inter-warehouse inventory transfers. Automatically locks stock into `reserved_quantity` upon drafting, transitions to `in_transit` upon manager dispatch, and lands in destination stock upon receiving. |
| **Stock Adjustments (Opname)** | `/stock-adjustments` | Cycle count discrepancy reconciliations. Requires discrepancy categorization (Damaged, Expired, Theft, Count Error) and manager authorization before posting balance corrections to the ledger. |
| **Analytical Reports** | `/reports/*` | Comprehensive valuation breakdowns by category, warehouse asset distribution, stock movement audits, and tabular CSV data export. |
| **Administration & RBAC** | `/admin/*` | User account lifecycle management, facility assignment scoping, granular role permissions configuration, and organizational document prefix settings. |

---

## 👥 Role-Based Access Control (RBAC) & Permissions

Strata WMS implements a strict, two-tiered authorization architecture:
1. **Functional Permission Gate:** Validated against 36 granular permission keys (e.g. `inventory.stock_in`, `purchase_orders.approve`, `transfers.complete`).
2. **Facility Access Scoping:** Operators can only view or execute transactions within warehouses explicitly assigned to their account (`user_warehouses`).

### Role Permissions Matrix

| Operational Capability | Administrator (`admin`) | Warehouse Manager (`warehouse_manager`) | Warehouse Staff (`warehouse_staff`) |
| :--- | :---: | :---: | :---: |
| **Facility Access Scope** | Global (All Facilities) | Assigned Facilities | Assigned Facilities |
| **View Dashboard & Inventory** | ✅ | ✅ | ✅ |
| **Direct Stock In / Stock Out** | ✅ | ✅ | ✅ |
| **Product & Category Management** | Full CRUD | Create & Edit | Read-Only |
| **Warehouse & Bin Management** | Full CRUD | Manage Locations | Read-Only |
| **Create Purchase Order (Draft)** | ✅ | ✅ | ❌ |
| **Approve / Cancel Purchase Order** | ✅ | ✅ | ❌ |
| **Receive PO Items (Goods Receipt)** | ✅ | ✅ | ✅ |
| **Create Stock Transfer Request** | ✅ | ✅ | ✅ |
| **Approve & Dispatch Stock Transfer** | ✅ | ✅ | ❌ |
| **Complete Stock Transfer (Receive)** | ✅ | ✅ | ✅ |
| **Submit Stock Adjustment Request** | ✅ | ✅ | ✅ |
| **Approve Stock Adjustment (Audit Gate)** | ✅ | ✅ | ❌ |
| **Financial Valuation & Analytics Reports** | ✅ | ✅ | ❌ |
| **User & Role Administration** | ✅ | ❌ | ❌ |
| **System & Document Prefix Settings** | ✅ | ❌ | ❌ |

---

## 🔑 Demo Sandbox Credentials

The database seeder automatically configures realistic multi-role demo accounts:

| Role | Email | Password | Assigned Scope & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Super Administrator** | `admin@stratawms.io` | `Password123!` | Global access across all 3 facilities, user administration, financial valuations, and system settings. |
| **Warehouse Manager** | `manager@stratawms.io` | `Password123!` | Facility manager for Jakarta Hub (`WH-JKT-01`) & Bandung Depot (`WH-BDG-03`). Approves POs, transfers, and adjustments. |
| **Warehouse Manager** | `nadia.manager@stratawms.io` | `Password123!` | Facility manager for Surabaya Fulfillment Center (`WH-SUB-01`). |
| **Warehouse Staff** | `staff@stratawms.io` | `Password123!` | Operator for Jakarta Hub (`WH-JKT-01`). Executes Stock In, Stock Out, PO receiving, and cycle count drafting. |
| **Warehouse Staff** | `dimas.staff@stratawms.io` | `Password123!` | Operator for Surabaya Fulfillment Center (`WH-SUB-01`). |

---

## 🛠️ Technology Stack

| Layer | Technologies | Architectural Rationale |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript 5, Vite 5 | SPA architecture, strict type safety, zero build latency. |
| **UI & Styling** | Tailwind CSS 3, Lucide React Icons | High-density enterprise theme, consistent spacing tokens, no decorative bloat. |
| **State & Query** | TanStack Query v5, Zustand | Optimistic cache invalidation, instant server state synchronization, lightweight UI layout state. |
| **Forms & Validation** | React Hook Form, Zod | Type-safe runtime schema validation matching backend FormRequests. |
| **Analytics Charts** | Recharts | Responsive SVG vector data visualization for inventory valuation and daily velocity. |
| **Backend API** | PHP 8.1+, Laravel 10 REST API | Enterprise service-layer architecture, FormRequest validation, Sanctum token authentication. |
| **Database** | MySQL 8.0 (InnoDB Engine) | Strict foreign keys, composite indexes, transactions with pessimistic locking (`SELECT ... FOR UPDATE`). |
| **DevOps & QA** | Docker, OpenAPI 3.0.3, PHPUnit | Feature testing suite, concurrency simulations, and Postman API collection. |

---

## 📂 Architecture & Documentation Index

Comprehensive engineering documents are located in the [`/docs`](./docs) directory:

1. [Product Requirements Document (PRD)](./docs/01-PRD.md) - Functional and non-functional specifications.
2. [System Architecture Specification](./docs/02-SYSTEM-ARCHITECTURE.md) - Layered design, concurrency patterns, and data flow.
3. [Database Architecture & Complete ERD](./docs/03-DATABASE-ERD.md) - 23-table normalized relational MySQL schema.
4. [API Reference & Endpoint Catalog](./docs/04-API-DOCUMENTATION.md) - 65 versioned REST endpoints (`/api/v1`).
5. [OpenAPI 3.0 Specification](./docs/openapi.yaml) & [Postman Collection](./docs/Strata-WMS.postman_collection.json) - Direct API testing artifacts.
6. [Testing & Quality Assurance Guide](./docs/05-TESTING-GUIDE.md) - Unit, feature, idempotency, and concurrency test instructions.
7. [Local Installation & Setup Guide](./docs/06-INSTALLATION.md) - Step-by-step developer setup.
8. [Production Deployment & Security Guide](./docs/07-DEPLOYMENT.md) - Hardening, rate limiting, and backup automation.

---

## 🚀 Quick Start Guide

### Prerequisites
- PHP 8.1 or higher with `pdo_mysql`, `bcmath`, `mbstring` extensions
- Composer 2.x
- Node.js 18.x or higher & npm
- MySQL 8.0 running locally or via Docker

### 1. Backend Setup
```bash
cd backend
cp .env.example .env

# Configure your database credentials in .env:
# DB_DATABASE=strata_wms
# DB_USERNAME=root
# DB_PASSWORD=your_mysql_password

php artisan key:generate
php artisan storage:link
php artisan migrate:fresh --seed
php artisan serve --port=8000
```
Backend API will be running at `http://127.0.0.1:8000`.

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Open your browser at **`http://localhost:5173`** and log in using any of the demo accounts listed above.

### 3. Automated Test Suite Execution
```bash
cd backend
php artisan test
```
All feature tests covering RBAC authorization, negative stock prevention, idempotent replaying, transfer reservations, and adjustment approval gates run automatically against MySQL.

---

## 📄 License
This project is licensed under the MIT License.
