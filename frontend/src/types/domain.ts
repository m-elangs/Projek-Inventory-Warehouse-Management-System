export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface RoleSummary {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  is_system?: boolean;
  users_count?: number;
  permissions?: PermissionItem[];
}

export interface PermissionItem {
  id: number;
  name: string;
  slug: string;
  module: string;
  description?: string | null;
}

export interface WarehouseLite {
  id: number;
  code: string;
  name: string;
}

export interface AuthUser {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  is_admin: boolean;
  last_login_at: string | null;
  role: RoleSummary | null;
  permissions: string[];
  warehouses: WarehouseLite[];
}

export interface Category {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  products_count?: number;
}

export interface Product {
  id: number;
  category_id: number;
  category?: { id: number; code: string; name: string };
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit_of_measure: string;
  unit_cost: number;
  selling_price: number;
  min_stock_level: number;
  reorder_quantity: number;
  image_url: string | null;
  is_active: boolean;
  total_on_hand: number;
  total_reserved: number;
  available_quantity: number;
  is_low_stock: boolean;
  created_at?: string;
  stocks?: Array<{
    id: number;
    warehouse_id: number;
    warehouse_location_id: number | null;
    quantity_on_hand: number;
    reserved_quantity: number;
    available_quantity: number;
    warehouse?: WarehouseLite;
    location?: { id: number; code: string; name: string } | null;
  }>;
  recent_movements?: StockMovement[];
}

export interface WarehouseLocation {
  id: number;
  warehouse_id: number;
  code: string;
  name: string;
  zone: string | null;
  location_type: 'receiving' | 'storage' | 'picking' | 'staging' | 'returns';
  is_active: boolean;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  manager_id: number | null;
  manager?: { id: number; name: string; email: string; employee_code: string } | null;
  is_active: boolean;
  locations_count?: number;
  total_units: number;
  total_valuation: number;
  locations?: WarehouseLocation[];
}

export interface InventoryStockRow {
  id: number;
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_location_id: number | null;
  location_code: string | null;
  location_name: string | null;
  product_id: number;
  sku: string;
  product_name: string;
  category_id: number;
  category_name: string;
  unit_of_measure: string;
  unit_cost: number;
  quantity_on_hand: number;
  reserved_quantity: number;
  available_quantity: number;
  min_stock_level: number;
  stock_value: number;
  health_status: 'healthy' | 'low_stock' | 'out_of_stock';
  last_movement_at: string | null;
}

export type MovementType =
  | 'stock_in'
  | 'purchase_receipt'
  | 'stock_out'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment_in'
  | 'adjustment_out';

export interface StockMovement {
  id: number;
  movement_number: string;
  warehouse_id: number;
  warehouse_location_id: number | null;
  product_id: number;
  movement_type: MovementType;
  quantity_change: number;
  balance_before: number;
  balance_after: number;
  unit_cost: string | number;
  reference_type: string;
  reference_id: number | null;
  reference_number: string;
  destination: string | null;
  notes: string | null;
  occurred_at: string;
  warehouse?: WarehouseLite;
  location?: { id: number; code: string; name: string } | null;
  product?: { id: number; sku: string; name: string; unit_of_measure: string };
  performer?: { id: number; name: string; employee_code?: string };
}

export interface Supplier {
  id: number;
  code: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  tax_id: string | null;
  payment_terms: string;
  is_active: boolean;
  purchase_orders_count?: number;
  total_purchased_amount?: string | number | null;
  purchase_orders?: PurchaseOrder[];
  goods_receipts?: GoodsReceipt[];
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  product_id: number;
  ordered_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
  unit_price: string | number;
  line_total: string | number;
  product?: { id: number; sku: string; name: string; unit_of_measure: string; unit_cost?: number };
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  warehouse_id: number;
  order_date: string;
  expected_delivery_date: string | null;
  status: 'draft' | 'approved' | 'partially_received' | 'completed' | 'cancelled';
  subtotal: string | number;
  tax_amount: string | number;
  discount_amount: string | number;
  total_amount: string | number;
  notes: string | null;
  items_count?: number;
  total_ordered_qty?: string | number;
  total_received_qty?: string | number;
  supplier?: { id: number; code: string; company_name: string; contact_person?: string; email?: string; phone?: string };
  warehouse?: WarehouseLite;
  creator?: { id: number; name: string; employee_code: string };
  approver?: { id: number; name: string; employee_code: string } | null;
  items?: PurchaseOrderItem[];
  receipts?: GoodsReceipt[];
}

export interface GoodsReceipt {
  id: number;
  receipt_number: string;
  receipt_type: 'purchase_order' | 'direct_stock_in';
  purchase_order_id: number | null;
  supplier_id: number | null;
  warehouse_id: number;
  receipt_date: string;
  supplier_delivery_note: string | null;
  status: string;
  notes: string | null;
  warehouse?: WarehouseLite;
  supplier?: { id: number; code: string; company_name: string } | null;
  purchase_order?: { id: number; po_number: string } | null;
  receiver?: { id: number; name: string; employee_code?: string };
  items?: Array<{
    id: number;
    product_id: number;
    quantity_received: number;
    unit_cost: string | number;
    product?: { id: number; sku: string; name: string; unit_of_measure: string };
  }>;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  source_warehouse_id: number;
  destination_warehouse_id: number;
  transfer_date: string;
  status: 'pending' | 'completed' | 'cancelled';
  notes: string | null;
  total_quantity?: string | number;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  source_warehouse?: WarehouseLite;
  destination_warehouse?: WarehouseLite;
  requester?: { id: number; name: string; employee_code: string };
  approver?: { id: number; name: string; employee_code: string } | null;
  completer?: { id: number; name: string; employee_code: string } | null;
  items?: Array<{
    id: number;
    product_id: number;
    source_location_id: number | null;
    destination_location_id: number | null;
    quantity: number;
    unit_cost: string | number;
    product?: { id: number; sku: string; name: string; unit_of_measure: string };
    source_location?: { id: number; code: string; name: string } | null;
    destination_location?: { id: number; code: string; name: string } | null;
  }>;
}

export interface StockAdjustment {
  id: number;
  adjustment_number: string;
  warehouse_id: number;
  adjustment_date: string;
  reason: 'cycle_count' | 'damaged' | 'expired' | 'theft_loss' | 'found_surplus' | 'data_correction';
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  rejection_reason: string | null;
  items_count?: number;
  approved_at: string | null;
  rejected_at: string | null;
  warehouse?: WarehouseLite;
  creator?: { id: number; name: string; employee_code: string };
  approver?: { id: number; name: string; employee_code: string } | null;
  items?: Array<{
    id: number;
    product_id: number;
    warehouse_location_id: number | null;
    previous_quantity: number;
    adjusted_quantity: number;
    difference_quantity: number;
    unit_cost: string | number;
    notes: string | null;
    product?: { id: number; sku: string; name: string; unit_of_measure: string };
    location?: { id: number; code: string; name: string } | null;
  }>;
}

export interface DashboardSummary {
  kpis: {
    total_products: number;
    active_categories: number;
    total_inventory_value: number;
    total_units_on_hand: number;
    total_reserved_units: number;
    low_stock_count: number;
    out_of_stock_count: number;
    total_warehouses: number;
    pending_transfers: number;
    pending_adjustments: number;
    open_purchase_orders: number;
  };
  movement_trends: Array<{
    date: string;
    label: string;
    inbound: number;
    outbound: number;
    inventory_value: number;
  }>;
  warehouse_distribution: Array<{
    warehouse_id: number;
    code: string;
    name: string;
    total_units: number;
    total_value: number;
    active_skus: number;
  }>;
  top_moving_products: Array<{
    product_id: number;
    sku: string;
    name: string;
    unit_of_measure: string;
    total_moved: number;
    inbound_units: number;
    outbound_units: number;
  }>;
  low_stock_alerts: Array<{
    product_id: number;
    sku: string;
    name: string;
    unit_of_measure: string;
    available_quantity: number;
    on_hand_quantity: number;
    min_stock_level: number;
    deficit: number;
    reorder_quantity: number;
  }>;
  recent_activity: {
    stock_in: StockMovement[];
    stock_out: StockMovement[];
    purchase_orders: PurchaseOrder[];
    transfers: StockTransfer[];
  };
}

export interface EmployeeRecord {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  phone: string | null;
  role_id: number;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  role?: RoleSummary;
  warehouses?: WarehouseLite[];
}

export interface ActivityLogItem {
  id: number;
  module: string;
  action: string;
  subject_type: string | null;
  subject_id: number | null;
  description: string;
  properties: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user?: { id: number; name: string; email: string; employee_code: string } | null;
}
