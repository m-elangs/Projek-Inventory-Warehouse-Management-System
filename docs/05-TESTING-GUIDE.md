# Testing & Quality Assurance Guide
## Strata WMS

---

## 1. Automated Test Suite Architecture

Backend feature and concurrency-integrity tests live in:
- [InventoryWmsFeatureTest.php](file:///d:/projek%20untuk%20kerja/Projek%20Inventory%20&%20Warehouse%20Management%20System/backend/tests/Feature/InventoryWmsFeatureTest.php)

Unlike superficial mock tests, Strata WMS runs feature tests against **MySQL 8.0 InnoDB** (`RefreshDatabase`) so foreign keys, stored generated columns (`location_key`), `SELECT ... FOR UPDATE` locks, and decimal precision behave identically to production.

---

## 2. Critical Test Scenarios Covered

| Test Method | Business Invariants Verified |
| :--- | :--- |
| `test_authentication_and_deactivated_account_enforcement` | Valid Sanctum login (`200`), invalid password (`401`), immediate revocation/blocking (`403`) when an active employee is deactivated. |
| `test_rbac_and_warehouse_scoping_restrictions` | `Warehouse Staff` blocked (`403`) from creating master SKUs, accessing `/admin/users`, or posting Stock In to an unassigned facility (`WH-TEST-SBY`). |
| `test_product_management_blocks_archiving_non_zero_stock` | Blocks archiving a product (`422`) while `quantity_on_hand > 0`; allows archiving once stock is cleanly dispatched to zero. |
| `test_stock_in_stock_out_negative_stock_prevention_and_idempotency` | Verifies `X-Idempotency-Key` replay protection (`X-Idempotent-Replay: true` without double-counting stock), rejects outbound quantities exceeding on-hand balance (`422`), and verifies `balance_before` / `quantity_change` / `balance_after` ledger math. |
| `test_warehouse_transfer_reservation_completion_and_cancellation` | Verifies pending transfer reserves stock (`reserved_quantity = 12`, `available_quantity = 8`), blocks competing Stock Out (`422`) from stealing reserved stock, atomically executes transfer across warehouses, and blocks duplicate completion (`409`). |
| `test_purchase_order_partial_and_full_receiving_workflow` | Tests `approved` → `partially_received` → `completed` lifecycle, blocks over-receiving beyond remaining open PO quantity (`422`), and reconciles resulting stock balance. |
| `test_stock_adjustment_approval_gate_and_live_concurrency_recalculation` | Blocks staff self-approval (`403`), simulates an intervening Stock Out between count submission and manager approval, verifies live locked variance recalculation (`25 -> 27 = +2`), and verifies exact valuation report output (`$13,500.00`). |

---

## 3. Running Backend & Frontend Checks

### 3.1 Prepare Dedicated Test Database
Create an isolated MySQL test database so running tests never touches development data:

```sql
CREATE DATABASE IF NOT EXISTS strata_wms_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3.2 Run PHPUnit Feature Suite
```powershell
cd backend
php artisan test --env=testing
```
*(Ensure `DB_DATABASE=strata_wms_test` and your local MySQL credentials are set in `backend/.env.testing` or `phpunit.xml`.)*

### 3.3 Run Frontend TypeScript & Bundle Verification
```powershell
cd frontend
npm run typecheck
npm run build
```
