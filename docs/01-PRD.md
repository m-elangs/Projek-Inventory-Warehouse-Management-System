# Product Requirements Document (PRD)
## Strata WMS — Enterprise Inventory & Warehouse Management System

| Metadata | Details |
| :--- | :--- |
| **Product Name** | Strata WMS |
| **Document Version** | 1.0.0 |
| **Status** | Approved for Implementation |
| **Target Segment** | Small-to-Medium Enterprises (SMEs), Multi-Warehouse Distributors, Retail Fulfillment Operations |
| **Architecture Stack** | React + TypeScript + Tailwind CSS (Frontend) / Laravel 10 REST API + MySQL 8.0 (Backend) |

---

## 1. Executive Summary & Problem Statement

Growing merchandising, distribution, and light-manufacturing businesses rapidly outgrow spreadsheet-driven inventory tracking, yet find legacy ERP suites bloated, punitive to learn, and prone to human entry error. Without strict ledger controls, multi-warehouse operators suffer from:

1. **Phantom & Negative Stock**: Concurrent outbound fulfillment or unrecorded adjustments cause physical stock and system balances to diverge.
2. **Untraceable Discrepancies**: Direct edits to item quantities overwrite history, making financial reconciliation and shrinkage root-cause analysis impossible.
3. **Disconnected Procurement**: Purchase orders live in emails/spreadsheets while warehouse receiving happens separately, causing over-receiving, missed backorders, and inaccurate inventory valuation.
4. **Weak Operational Boundaries**: Warehouse floor staff can accidentally modify master catalog records, approve their own shrinkage write-offs, or mutate stock in facilities they are not assigned to.

**Strata WMS** solves these problems by combining an **append-only inventory movement ledger**, **transactional concurrency controls**, **warehouse-scoped role-based access control (RBAC)**, and a **high-density, zero-clutter operational interface** inspired by Linear, Stripe Dashboard, and modern financial ledgers.

---

## 2. Product Goals & Non-Goals

### 2.1 Core Product Goals
- **100% Ledger Traceability**: Every single unit of stock in any warehouse must be mathematically reconcilable from immutable `stock_movements` entries.
- **Zero Negative Stock Guarantee**: Enforce row-level database locking (`SELECT ... FOR UPDATE`) and validation on every outbound, transfer, and downward adjustment transaction.
- **Multi-Warehouse & Bin Precision**: Track stock across distinct physical warehouses and internal storage locations (zones, aisles, racks, bins).
- **Closed-Loop Procurement**: Connect Suppliers -> Purchase Orders -> Partial/Full Goods Receipts -> Automatic Stock-In Ledger Entries.
- **Strict Authorization & Auditability**: Enforce backend policies for Admin, Warehouse Manager, and Warehouse Staff roles, scoped by warehouse assignment, backed by an immutable activity log.
- **Clean Operational Ergonomics**: Deliver fast keyboard-accessible workflows, clear tabular typography (`tabular-nums`), purposeful data visualizations, and explicit separation of demo vs. production datasets.

### 2.2 Explicit Non-Goals (v1.0 Scope Boundary)
- Multi-currency FX revaluation accounting or full double-entry general ledger (GL) tax filing (Strata WMS tracks unit cost and moving/standard inventory valuation, ready for ERP export).
- Manufacturing Bill of Materials (BOM) work-order kitting/assembly.
- Third-party carrier shipping label generation (FedEx/UPS/DHL APIs) or e-commerce storefront checkout hosting.

---

## 3. User Personas & Role Matrix

Strata WMS enforces authorization at two levels: **Role Permissions (RBAC)** and **Warehouse Assignment Scope**. Every API endpoint validates permissions via Laravel Policies and FormRequests—never relying solely on hidden UI controls.

| Capability / Module | Admin | Warehouse Manager | Warehouse Staff |
| :--- | :---: | :---: | :---: |
| **Dashboard & KPIs** | All Warehouses | Assigned Warehouses | Assigned Warehouses (Operational KPIs) |
| **Product & Category Catalog** | Create, Edit, Archive, View | Create, Edit, View | View Only |
| **Warehouse & Location Setup** | Full CRUD & Staff Assignment | Manage Locations in Assigned Warehouses | View Assigned Warehouses & Locations |
| **Stock In (Direct & PO Receipt)** | All Warehouses | Assigned Warehouses | Assigned Warehouses |
| **Stock Out** | All Warehouses | Assigned Warehouses | Assigned Warehouses |
| **Stock Transfers** | Create, Approve, Complete, Cancel (All) | Create, Approve, Complete, Cancel (Assigned) | Create Request, Complete Inbound/Outbound (Assigned) |
| **Stock Adjustments** | Create, Approve, Reject (All) | Create, Approve, Reject (Assigned) | Create Draft/Pending Request Only (Cannot Self-Approve) |
| **Purchase Orders** | Create, Approve, Cancel, Receive | Create, Approve, Receive (Assigned) | View Approved POs & Record Goods Receipt (Assigned) |
| **Suppliers** | Full CRUD | Create, Edit, View | View Only |
| **Inventory & Transaction Reports** | Full Financial + Operational + Export | Assigned Warehouse Reports + Export | Assigned Stock & Movement History (No System-Wide Financials) |
| **Users, Roles, Permissions & Settings** | Full Access | None | None |

---

## 4. Application Information Architecture & Navigation

The interface uses a disciplined, collapsible left sidebar grouped into four operational domains, paired with a clean top header containing breadcrumb navigation, a global warehouse filter/context indicator, quick-search, and user profile menu.

1. **MAIN**
   - `Overview` (`/`) — Executive & operational KPIs, movement/valuation charts, low-stock alerts, live transaction feed.
   - `Inventory` (`/inventory`) — Real-time stock matrix by product, warehouse, and bin location; on-hand, reserved, and available quantities; stock health status.
   - `Products` (`/products`) — Master SKU catalog, categories, barcode, unit cost, minimum stock threshold, active/archived lifecycle.
   - `Warehouses` (`/warehouses`) — Facility registry, manager assignment, storage bin locations (`warehouse_locations`), capacity/utilization overview, warehouse-specific stock view.
   - `Stock Movements` (`/stock-movements`) — Immutable audit ledger of every inbound, outbound, transfer, receipt, and adjustment event with reference drill-down.
2. **OPERATIONS**
   - `Purchase Orders` (`/purchase-orders`) — PO creation, multi-line item pricing, approval workflow, partial/full Goods Receipt conversion into inventory.
   - `Stock Transfers` (`/stock-transfers`) — Inter-warehouse stock movement requests, approval/dispatch workflow, atomic source-to-destination execution.
   - `Stock Adjustments` (`/stock-adjustments`) — Cycle count reconciliation, shrinkage/damage write-offs, mandatory reason codes, variance preview, manager approval gate.
   - `Suppliers` (`/suppliers`) — Vendor directory, contact profiles, lead-time notes, linked PO and inbound receipt history.
3. **ANALYTICS**
   - `Inventory Reports` (`/reports/inventory`) — Valuation by warehouse and category, stock health breakdown (Healthy / Low Stock / Out of Stock / Overstock), dead-stock indicators, CSV export.
   - `Transaction Reports` (`/reports/transactions`) — Inbound vs. outbound volume trends, adjustment shrinkage summary, PO fulfillment metrics, filterable audit export.
4. **ADMINISTRATION**
   - `User Management` (`/admin/users`) — Employee accounts, status toggling, role assignment, multi-warehouse access mapping.
   - `Roles & Permissions` (`/admin/roles`) — Role definitions and granular permission matrix inspection/configuration.
   - `Settings` (`/admin/settings`) — Organization profile, default currency/valuation display, document number prefixes (`PO-`, `TRF-`, `ADJ-`, `GRN-`), low-stock alert behavior, system audit log viewer.

---

## 5. Detailed Functional Requirements

### 5.1 Dashboard (`Overview`)
- **KPI Summary Strip**:
  1. **Total Active Products** (with count of active categories).
  2. **Total Inventory Valuation** (computed as $\sum (\text{quantity\_on\_hand} \times \text{unit\_cost})$ across permitted warehouses).
  3. **Low Stock & Out-of-Stock Items** (items where `available_quantity <= min_stock_level`, highlighting zero-stock critical items).
  4. **Active Warehouses** (total operational facilities & active storage locations).
- **Business Charts (Meaningful, Zero-Fluff)**:
  - **Stock Movement Flow (Time Series)**: Daily/weekly inbound vs. outbound unit volume over the last 30/90 days.
  - **Inventory Valuation Trend**: Historical valuation trajectory across warehouses.
  - **Stock Distribution by Warehouse**: Horizontal bar / breakdown comparing unit volume and financial value per facility.
  - **Top Moving Products**: Ranked SKUs by total outbound + transfer velocity in the selected period.
  - **Actionable Low Stock Alerts Table**: Products below reorder threshold with current stock, minimum stock, deficit, and quick action to create a Purchase Order or Stock Transfer.
- **Recent Operational Activity**:
  - Tabbed or unified chronological feed showing latest Stock In, Stock Out, Purchase Orders, and Stock Transfers with clickable reference codes, timestamps, and responsible operators.

### 5.2 Product & Category Management
- Manage hierarchical or flat **Categories** (`name`, `code`, `description`, `is_active`).
- Manage **Products**:
  - Unique `sku` (normalized uppercase alphanumeric + hyphens) and optional unique `barcode` (EAN/UPC/Code128).
  - `name`, `category_id`, `unit_of_measure` (`pcs`, `box`, `kg`, `liter`, `pallet`, `pack`, `meter`), `unit_cost`, `selling_price` (optional reference), `min_stock_level`, `reorder_quantity`.
  - `image_path` (validated image upload with clean placeholder fallback when unset).
  - Lifecycle: `is_active` toggle plus soft-delete/archive protection (products with non-zero current inventory cannot be archived or deleted until stock is zeroed/transferred).

### 5.3 Warehouse & Storage Location Management
- **Warehouses**: Unique `code` (e.g., `WH-JKT-01`), `name`, `address`, `city`, `phone`, `manager_id` (foreign key to `users`), `is_active`.
- **Storage Locations (`warehouse_locations`)**: Sub-divisions inside a warehouse (`code` e.g., `A-01-R2-B1`, `name`, `zone`, `location_type`: `receiving`, `storage`, `picking`, `staging`, `is_active`), unique per `(warehouse_id, code)`.
- Detailed warehouse view showing assigned staff, bin locations, current SKU count, total units on hand, and total inventory value in that facility.

### 5.4 Stock In & Goods Receipt
- **Direct Stock In**:
  - Record incoming stock outside or alongside a PO (e.g., initial stock load, customer return restock, direct cash purchase).
  - Fields: `warehouse_id`, optional `warehouse_location_id`, optional `supplier_id`, optional `purchase_order_id`, `transaction_date`, `reference_number`, `notes`, and one or more line items (`product_id`, `quantity > 0`, `unit_cost`).
- **PO-Linked Goods Receipt (`goods_receipts`)**:
  - Select an approved or partially received Purchase Order.
  - Display ordered quantity, previously received quantity, and remaining receivable quantity per line item.
  - Prevent over-receiving beyond ordered quantity (unless explicitly permitted by system setting, disabled by default).
  - Automatically increment `inventory_stocks`, write immutable `stock_movements` (`type = purchase_receipt` or `stock_in`), update `purchase_order_items.received_quantity`, and transition PO status (`partially_received` or `completed`).

### 5.5 Stock Out
- Record outbound stock dispatch (sales fulfillment, internal consumption, sample dispatch).
- Fields: `warehouse_id`, optional `warehouse_location_id`, `product_id` (or multi-line batch), `quantity > 0`, `destination` / `customer_reference`, `transaction_date`, `notes`.
- **Strict Stock Validation**: Under row lock, verify `available_quantity >= requested_quantity`. If insufficient, abort transaction and return structured `422` validation error detailing exact available vs. requested stock.

### 5.6 Inter-Warehouse Stock Transfers
- Fields: `transfer_number` (`TRF-YYYYMMDD-XXXX`), `source_warehouse_id`, `source_location_id` (optional), `destination_warehouse_id` (must differ from source), `destination_location_id` (optional), `status`, `requested_by`, `approved_by`, `completed_by`, `notes`, line items (`product_id`, `quantity`).
- **Lifecycle States**:
  - `pending`: Request created; stock availability verified at creation; optional reservation (`reserved_quantity` incremented on source stock so concurrent Stock Out cannot steal earmarked transfer stock!).
  - `completed`: Approved & received; within one DB transaction under deterministic lock order, deduct `quantity_on_hand` (and release `reserved_quantity`) at source warehouse, increment `quantity_on_hand` at destination warehouse, and record paired `transfer_out` and `transfer_in` ledger rows in `stock_movements`.
  - `cancelled`: Releases any reserved stock on the source warehouse without altering `quantity_on_hand`; records audit log.

### 5.7 Stock Adjustments
- Purpose: Reconcile physical cycle counts against system balances or write off damaged/expired goods.
- Fields: `adjustment_number` (`ADJ-YYYYMMDD-XXXX`), `warehouse_id`, `reason` (`cycle_count`, `damaged`, `expired`, `theft_loss`, `found_surplus`, `data_correction`), `notes` (mandatory explanation), `status` (`pending`, `approved`, `rejected`), line items (`product_id`, `warehouse_location_id`, `previous_quantity`, `adjusted_quantity`, `difference_quantity`).
- **Concurrency & Integrity Rule**: When an adjustment is approved by a Warehouse Manager or Admin, the system locks the `inventory_stocks` row, verifies current `quantity_on_hand` (preventing stale overwrite or negative balance), computes exact delta, writes `adjustment_in` or `adjustment_out` to `stock_movements`, and stamps `approved_by` + `approved_at`.

### 5.8 Purchase Orders & Suppliers
- **Suppliers**: Unique `code`, `company_name`, `contact_person`, `email`, `phone`, `address`, `tax_id`, `payment_terms`, `is_active`, plus full tab of historical POs and Goods Receipts.
- **Purchase Orders**:
  - `po_number` (`PO-YYYYMMDD-XXXX`), `supplier_id`, target `warehouse_id`, `order_date`, `expected_delivery_date`, `status` (`draft`, `approved`, `partially_received`, `completed`, `cancelled`), `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `notes`.
  - Multi-line items (`product_id`, `ordered_quantity`, `received_quantity`, `unit_price`, `line_total`).
  - Draft POs can be edited; once `approved`, quantities/prices lock and receiving progress is tracked automatically through Goods Receipts.

---

## 6. Non-Negotiable Inventory Ledger Rules

1. **Single Source of Truth**: `inventory_stocks.quantity_on_hand` may ONLY be mutated inside the backend `InventoryLedgerService`, which atomically inserts a corresponding `stock_movements` record (`balance_before`, `quantity_change`, `balance_after`).
2. **Mandatory Attribution**: Every `stock_movements` row stores `performed_by` (`user_id`), `reference_type`, `reference_id`, `reference_number`, and `occurred_at`.
3. **Zero Negative Inventory**: Neither `quantity_on_hand` nor `available_quantity` (`quantity_on_hand - reserved_quantity`) can ever drop below `0`.
4. **Atomic Multi-Record Updates**: Every multi-row or multi-table write runs inside `DB::transaction()`.
5. **Idempotency Protection**: Mutating stock endpoints support an `idempotency_key` (persisted/checked) and status transition guards (e.g., a `completed` transfer cannot be completed twice) to eliminate double-submission bugs.
6. **Deadlock-Free Pessimistic Locking**: Multi-item or inter-warehouse stock mutations sort target `(warehouse_id, product_id, warehouse_location_id)` tuples deterministically before executing `SELECT ... FOR UPDATE`.
7. **Immutable Audit Trail**: `stock_movements` and `activity_logs` are append-only; no API endpoint permits updating or deleting historical ledger rows.
8. **Pending vs. Completed Separation**: Draft POs, pending adjustments, and pending transfers never inflate destination on-hand stock until explicitly completed/approved.
9. **Demo vs. Production Data Separation**: Database seeders strictly separate `CoreSystemSeeder` (roles, permissions, default settings, optional bootstrap admin) from `DemoDatasetSeeder` (realistic multi-warehouse catalog, historical POs, movements, and alerts used only in local/staging demo environments).

---

## 7. Design System & User Experience Standards ("Anti-AI-Slop")

### 7.1 Color Tokens
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--bg-canvas` | `#F7F8FA` | App shell background and subtle table header fill |
| `--bg-surface` | `#FFFFFF` | Cards, data tables, modals, slide-over drawers, form panels |
| `--text-primary` | `#171A21` | Headings, primary table cell data, active navigation labels |
| `--text-secondary` | `#667085` | Column headers, helper labels, timestamps, metadata |
| `--border-subtle` | `#E6E8EC` | Crisp `1px solid` structural dividers, card borders, input borders |
| `--accent-primary` | `#334E85` | Primary CTA buttons, active sidebar indicator, focus rings, key chart series |
| `--status-success` | `#16845B` | Completed states, healthy stock badges, positive inbound deltas |
| `--status-warning` | `#B7791F` | Low stock alerts, pending approvals, partially received POs |
| `--status-danger` | `#C2413B` | Out-of-stock alerts, destructive actions, cancelled/rejected badges |

### 7.2 Typography & Layout Discipline
- **Font Stack**: `Inter` (primary UI & prose) paired with `JetBrains Mono` / monospace `tabular-nums` for SKUs, barcodes, document numbers (`PO-`, `TRF-`), quantities, and currency amounts.
- **Hierarchy**: Page titles at `20px–22px` (`font-semibold`, tight tracking), section titles at `15px–16px`, dense readable table rows at `13px–14px` with `40px–44px` row height.
- **Strict Visual Restraint**:
  - Border radius capped at `6px` (`rounded-md`) for inputs/buttons and `8px` (`rounded-lg`) for panels/modals.
  - Zero glassmorphism, zero decorative gradients, zero rainbow KPI cards, zero emoji icons (exclusively `lucide-react` `16px`/`18px` stroke icons).
  - Purposeful feedback: skeleton loaders matching exact table/card geometry, inline field validation errors, confirmation dialogs for state-irreversible actions, and empty states with direct CTA buttons.
