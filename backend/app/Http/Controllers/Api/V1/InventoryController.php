<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\StockInRequest;
use App\Http\Requests\Inventory\StockOutRequest;
use App\Models\GoodsReceipt;
use App\Models\InventoryStock;
use App\Models\StockMovement;
use App\Services\StockOperationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(
        private readonly StockOperationService $stockOps
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = InventoryStock::accessibleBy($request->user())
            ->join('products', 'products.id', '=', 'inventory_stocks.product_id')
            ->join('categories', 'categories.id', '=', 'products.category_id')
            ->join('warehouses', 'warehouses.id', '=', 'inventory_stocks.warehouse_id')
            ->leftJoin('warehouse_locations', 'warehouse_locations.id', '=', 'inventory_stocks.warehouse_location_id')
            ->whereNull('products.deleted_at')
            ->select([
                'inventory_stocks.*',
                'products.sku as product_sku',
                'products.name as product_name',
                'products.unit_of_measure',
                'products.unit_cost',
                'products.min_stock_level',
                'categories.id as category_id',
                'categories.name as category_name',
                'warehouses.code as warehouse_code',
                'warehouses.name as warehouse_name',
                'warehouse_locations.code as location_code',
                'warehouse_locations.name as location_name',
            ]);

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where('inventory_stocks.warehouse_id', (int) $warehouseId);
        }

        if ($categoryId = $request->query('category_id')) {
            $query->where('products.category_id', (int) $categoryId);
        }

        if ($productId = $request->query('product_id')) {
            $query->where('inventory_stocks.product_id', (int) $productId);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('products.sku', 'like', "%{$search}%")
                    ->orWhere('products.name', 'like', "%{$search}%")
                    ->orWhere('warehouses.code', 'like', "%{$search}%")
                    ->orWhere('warehouse_locations.code', 'like', "%{$search}%");
            });
        }

        if ($status = $request->query('stock_status')) {
            if ($status === 'out_of_stock') {
                $query->whereRaw('(inventory_stocks.quantity_on_hand - inventory_stocks.reserved_quantity) <= 0');
            } elseif ($status === 'low_stock') {
                $query->whereRaw('products.min_stock_level > 0 AND (inventory_stocks.quantity_on_hand - inventory_stocks.reserved_quantity) <= products.min_stock_level AND (inventory_stocks.quantity_on_hand - inventory_stocks.reserved_quantity) > 0');
            } elseif ($status === 'healthy') {
                $query->whereRaw('(inventory_stocks.quantity_on_hand - inventory_stocks.reserved_quantity) > products.min_stock_level');
            }
        }

        $sortMap = [
            'sku' => 'products.sku',
            'product_name' => 'products.name',
            'warehouse_code' => 'warehouses.code',
            'quantity_on_hand' => 'inventory_stocks.quantity_on_hand',
            'last_movement_at' => 'inventory_stocks.last_movement_at',
        ];
        $sortKey = $request->query('sort_by', 'last_movement_at');
        $sortColumn = $sortMap[$sortKey] ?? 'inventory_stocks.updated_at';
        $sortDir = $this->safeSortDirection($request->query('sort_dir'), 'desc');

        $paginator = $query->orderBy($sortColumn, $sortDir)
            ->paginate($this->safePerPage($request->query('per_page'), 20));

        return $this->paginated($paginator, 'Inventory stock balances retrieved.', function ($row) {
            $onHand = (int) $row->quantity_on_hand;
            $reserved = (int) $row->reserved_quantity;
            $available = max(0, $onHand - $reserved);
            $minStock = (int) $row->min_stock_level;
            $unitCost = (float) $row->unit_cost;

            return [
                'id' => $row->id,
                'warehouse_id' => $row->warehouse_id,
                'warehouse_code' => $row->warehouse_code,
                'warehouse_name' => $row->warehouse_name,
                'warehouse_location_id' => $row->warehouse_location_id,
                'location_code' => $row->location_code,
                'location_name' => $row->location_name,
                'product_id' => $row->product_id,
                'sku' => $row->product_sku,
                'product_name' => $row->product_name,
                'category_id' => (int) $row->category_id,
                'category_name' => $row->category_name,
                'unit_of_measure' => $row->unit_of_measure,
                'unit_cost' => round($unitCost, 2),
                'quantity_on_hand' => $onHand,
                'reserved_quantity' => $reserved,
                'available_quantity' => $available,
                'min_stock_level' => $minStock,
                'stock_value' => round($onHand * $unitCost, 2),
                'health_status' => $available === 0
                    ? 'out_of_stock'
                    : ($minStock > 0 && $available <= $minStock ? 'low_stock' : 'healthy'),
                'last_movement_at' => $row->last_movement_at?->toISOString(),
            ];
        });
    }

    public function movements(Request $request): JsonResponse
    {
        $query = StockMovement::accessibleBy($request->user())
            ->with([
                'warehouse:id,code,name',
                'location:id,code,name',
                'product:id,sku,name,unit_of_measure',
                'performer:id,name,employee_code',
            ]);

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where('warehouse_id', (int) $warehouseId);
        }

        if ($productId = $request->query('product_id')) {
            $query->where('product_id', (int) $productId);
        }

        if ($type = $request->query('movement_type')) {
            $query->where('movement_type', $type);
        }

        if ($dateFrom = $request->query('date_from')) {
            $query->whereDate('occurred_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->query('date_to')) {
            $query->whereDate('occurred_at', '<=', $dateTo);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('movement_number', 'like', "%{$search}%")
                    ->orWhere('reference_number', 'like', "%{$search}%")
                    ->orWhere('destination', 'like', "%{$search}%")
                    ->orWhereHas('product', fn ($pq) => $pq->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"));
            });
        }

        $paginator = $query->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 20));

        return $this->paginated($paginator, 'Stock movement ledger retrieved.');
    }

    public function receipts(Request $request): JsonResponse
    {
        $query = GoodsReceipt::accessibleBy($request->user())
            ->with([
                'warehouse:id,code,name',
                'supplier:id,code,company_name',
                'purchaseOrder:id,po_number',
                'receiver:id,name,employee_code',
                'items.product:id,sku,name,unit_of_measure',
            ]);

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where('warehouse_id', (int) $warehouseId);
        }

        $paginator = $query->orderByDesc('receipt_date')
            ->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Goods receipts retrieved.');
    }

    public function stockIn(StockInRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['warehouse_id']);

        $receipt = $this->stockOps->recordDirectStockIn($validated, $request->user());

        return $this->success($receipt, 'Stock In recorded successfully.', 201);
    }

    public function stockOut(StockOutRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['warehouse_id']);

        $result = $this->stockOps->recordStockOut($validated, $request->user());

        return $this->success($result, 'Stock Out recorded successfully.', 201);
    }
}
