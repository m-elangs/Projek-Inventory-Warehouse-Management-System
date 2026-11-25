# Strata WMS — Backend REST API Service
### Laravel 10 Enterprise Inventory & Ledger Engine

This directory contains the core business logic, domain services, database migrations, and REST API controllers for the **Strata WMS** platform.

---

## 🏗️ Backend Architecture

The backend is built following a clean layered architecture with strict separation of concerns:

```text
app/
├── Http/
│   ├── Controllers/Api/V1/    # 14 bounded REST controllers (65 versioned endpoints)
│   ├── Middleware/            # EnsureActiveUser, CheckPermission, IdempotencyMiddleware
│   └── Requests/              # Strongly-validated FormRequests with custom rules
├── Models/                    # 21 Eloquent models with warehouse access scopes & relations
├── Policies/                  # Domain authorization policies matching granular permissions
├── Services/                  # Core domain service layer encapsulating all business logic
│   ├── InventoryLedgerService.php   # Append-only ledger mutations with row-level locks
│   ├── StockOperationService.php    # High-level direct Inbound and Outbound dispatches
│   ├── PurchaseOrderService.php     # PO drafting, approval gates, and goods receipt
│   ├── StockTransferService.php     # 2-phase reservation and inter-warehouse dispatch
│   ├── StockAdjustmentService.php   # Discrepancy submission and manager approval gates
│   ├── DashboardAnalyticsService.php# High-performance KPI calculations and velocity trends
│   ├── ReportService.php            # Valuation, movement history, and CSV exports
│   ├── ActivityAuditService.php     # System-wide operational event logging
│   └── DocumentNumberService.php    # Sequential document numbering (PO-, TRF-, ADJ-)
└── Exceptions/                # DomainRuleException, InsufficientStockException, JSON handler
```

---

## 🔒 Security & Concurrency Design

1. **Deadlock Prevention via Slot Sorting:**
   When mutating multiple products across locations in a single transaction, the `InventoryLedgerService` deterministically sorts all target slots by `(warehouse_id, product_id, location_key)` before executing `SELECT ... FOR UPDATE` locks. This guarantees that concurrent transactions never lock resources in opposing order.

2. **Negative Stock Prevention:**
   The ledger strictly forbids any mutation that results in `quantity_on_hand < 0`. Unreserved dispatches also cannot consume units currently held under `reserved_quantity` for in-transit transfers.

3. **API Idempotency:**
   All state-mutating requests (`POST`, `PUT`, `PATCH`) support an optional `X-Idempotency-Key` header. Requests are hashed (`SHA-256`) and tracked in the `idempotency_keys` table to return the original cached response upon duplicate retries without double-decrementing stock.

4. **Two-Tier Authorization:**
   - **Tier 1:** Sanctum token verification and `CheckPermission` middleware matching 36 granular permission keys.
   - **Tier 2:** `user_warehouses` scoping enforced via Eloquent global query scopes (`accessibleBy()`) and Controller authorization gates.

---

## 👥 Seeded User Roles & Credentials

All seeded accounts share the default development password: `Password123!`

| Role Slug | Email | Operator Name | Assigned Facility Scope |
| :--- | :--- | :--- | :--- |
| `admin` | `admin@stratawms.io` | Elena Vance | Global (All 3 Facilities) |
| `warehouse_manager` | `manager@stratawms.io` | Marcus Hendra | Jakarta Hub (`WH-JKT-01`) & Bandung (`WH-BDG-03`) |
| `warehouse_manager` | `nadia.manager@stratawms.io` | Nadia Kusuma | Surabaya Fulfillment Center (`WH-SUB-01`) |
| `warehouse_staff` | `staff@stratawms.io` | Rizky Pratama | Jakarta Hub (`WH-JKT-01`) |
| `warehouse_staff` | `dimas.staff@stratawms.io` | Dimas Saputra | Surabaya Fulfillment Center (`WH-SUB-01`) |

---

## 🛠️ Local API Commands

```bash
# Run migrations with core and demo seeders
php artisan migrate:fresh --seed

# Run automated feature & concurrency test suite
php artisan test

# Start the local development API server
php artisan serve --port=8000
```
