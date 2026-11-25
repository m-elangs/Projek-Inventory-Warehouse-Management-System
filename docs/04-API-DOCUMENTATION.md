# REST API Reference & Integration Guide
## Strata WMS — `/api/v1`

Machine-readable specifications:
- **OpenAPI 3.0.3 Spec**: [openapi.yaml](file:///d:/projek%20untuk%20kerja/Projek%20Inventory%20&%20Warehouse%20Management%20System/docs/openapi.yaml)
- **Postman Collection**: [Strata-WMS.postman_collection.json](file:///d:/projek%20untuk%20kerja/Projek%20Inventory%20&%20Warehouse%20Management%20System/docs/Strata-WMS.postman_collection.json)

---

## 1. Authentication & Request Headers

All endpoints except `GET /api/v1/health` and `POST /api/v1/auth/login` require a valid Laravel Sanctum Personal Access Token:

```http
Authorization: Bearer <token>
Accept: application/json
Content-Type: application/json
X-Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

- **`X-Idempotency-Key`**: Optional (recommended) on all `POST`/`PUT` operational mutations. Duplicate requests with the same key and payload replay the cached `2xx` response with header `X-Idempotent-Replay: true` without re-running ledger changes. Reusing a key with a modified payload returns `409 Conflict`.

---

## 2. Complete Endpoint Matrix (65 Registered Routes)

| Domain | Method & Path | Permission / Policy | Purpose |
| :--- | :--- | :--- | :--- |
| **System** | `GET /api/v1/health` | Public | Health check probe |
| **Auth** | `POST /api/v1/auth/login` | Public (`throttle:auth-login`) | Issue Sanctum token & user session |
| **Auth** | `GET /api/v1/auth/me` | `auth:sanctum` | Fetch profile, permissions, & warehouses |
| **Auth** | `PUT /api/v1/auth/profile` | `auth:sanctum` | Update profile or change password |
| **Auth** | `POST /api/v1/auth/logout` | `auth:sanctum` | Revoke active access token |
| **Dashboard** | `GET /api/v1/dashboard` | `dashboard.view` | KPIs, movement & valuation trends, alerts |
| **Catalog** | `GET /api/v1/categories` | `categories.view` / `products.view` | List product categories |
| **Catalog** | `POST /api/v1/categories` | `categories.manage` | Create category |
| **Catalog** | `PUT /api/v1/categories/{id}` | `categories.manage` | Update category |
| **Catalog** | `DELETE /api/v1/categories/{id}` | `categories.manage` | Archive empty category |
| **Products** | `GET /api/v1/products` | `ProductPolicy@viewAny` | Paginated/filtered SKU catalog |
| **Products** | `POST /api/v1/products` | `ProductPolicy@create` | Create SKU (JSON or `multipart/form-data`) |
| **Products** | `GET /api/v1/products/{id}` | `ProductPolicy@view` | SKU stock slots & movement history |
| **Products** | `PUT/POST /api/v1/products/{id}` | `ProductPolicy@update` | Update SKU attributes / image |
| **Products** | `DELETE /api/v1/products/{id}` | `ProductPolicy@delete` | Archive SKU (blocked if stock > 0) |
| **Warehouses** | `GET /api/v1/warehouses` | `WarehousePolicy@viewAny` | List accessible facilities & valuation |
| **Warehouses** | `POST /api/v1/warehouses` | `WarehousePolicy@create` | Create facility + default bins |
| **Warehouses** | `GET /api/v1/warehouses/{id}` | `WarehousePolicy@view` | Facility stock & assigned personnel |
| **Warehouses** | `PUT /api/v1/warehouses/{id}` | `WarehousePolicy@update` | Update facility details |
| **Warehouses** | `POST /api/v1/warehouses/{id}/locations` | `WarehousePolicy@manageLocations` | Add internal storage bin |
| **Warehouses** | `PUT /api/v1/warehouses/{id}/locations/{loc}` | `WarehousePolicy@manageLocations` | Update storage bin |
| **Inventory** | `GET /api/v1/inventory` | `inventory.view` | Real-time stock balances (`on_hand`, `reserved`, `available`) |
| **Inventory** | `GET /api/v1/inventory/movements` | `inventory.view` | Immutable `stock_movements` audit ledger |
| **Inventory** | `GET /api/v1/inventory/receipts` | `inventory.view` | Goods receipt history |
| **Inventory** | `POST /api/v1/inventory/stock-in` | `inventory.stock_in` + Warehouse Scope | Direct Stock In transaction |
| **Inventory** | `POST /api/v1/inventory/stock-out` | `inventory.stock_out` + Warehouse Scope | Stock Out with negative-stock guard |
| **Suppliers** | `GET/POST/PUT/DELETE /api/v1/suppliers` | `suppliers.*` | Vendor directory & PO/receipt history |
| **Procurement** | `GET/POST/PUT /api/v1/purchase-orders` | `PurchaseOrderPolicy` | Create & manage Purchase Orders |
| **Procurement** | `POST /api/v1/purchase-orders/{id}/approve` | `PurchaseOrderPolicy@approve` | Transition Draft PO → Approved |
| **Procurement** | `POST /api/v1/purchase-orders/{id}/cancel` | `PurchaseOrderPolicy@cancel` | Cancel unreceived PO |
| **Procurement** | `POST /api/v1/purchase-orders/{id}/receive` | `PurchaseOrderPolicy@receive` | Post partial/full Goods Receipt into stock |
| **Transfers** | `GET/POST /api/v1/stock-transfers` | `StockTransferPolicy` | Create transfer & reserve source stock |
| **Transfers** | `POST /api/v1/stock-transfers/{id}/approve` | `StockTransferPolicy@approve` | Stamp manager approval |
| **Transfers** | `POST /api/v1/stock-transfers/{id}/complete` | `StockTransferPolicy@complete` | Atomic source deduction & destination credit |
| **Transfers** | `POST /api/v1/stock-transfers/{id}/cancel` | `StockTransferPolicy@cancel` | Cancel pending transfer & release reserve |
| **Adjustments** | `GET/POST /api/v1/stock-adjustments` | `StockAdjustmentPolicy` | Submit cycle count / shrinkage request |
| **Adjustments** | `POST /api/v1/stock-adjustments/{id}/approve` | `StockAdjustmentPolicy@approve` | Apply live locked variance to ledger |
| **Adjustments** | `POST /api/v1/stock-adjustments/{id}/reject` | `StockAdjustmentPolicy@approve` | Reject pending adjustment with reason |
| **Reports** | `GET /api/v1/reports/inventory` (+ `/export`) | `reports.inventory` / `reports.export` | Valuation & stock health report + CSV |
| **Reports** | `GET /api/v1/reports/transactions` (+ `/export`) | `reports.transactions` / `reports.export` | Period movement audit report + CSV |
| **Admin** | `GET/POST/PUT /api/v1/admin/users` | `users.manage` | Employee accounts & warehouse assignments |
| **Admin** | `GET/POST/PUT /api/v1/admin/roles` | `roles.manage` | Role & permission matrix management |
| **Admin** | `GET/PUT /api/v1/admin/settings` | `settings.manage` | System configuration & prefixes |
| **Admin** | `GET /api/v1/admin/activity-logs` | `settings.manage` | Immutable system audit trail |
