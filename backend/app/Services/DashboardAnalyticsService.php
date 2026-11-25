<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\StockTransfer;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardAnalyticsService
{
    public function getSummary(User $user, ?int $warehouseFilter = null, int $days = 14): array
    {
        $days = max(7, min($days, 90));
        $warehouseIds = $this->resolveScopedWarehouseIds($user, $warehouseFilter);

        $totalProducts = Product::where('is_active', true)->count();
        $activeCategories = Category::where('is_active', true)->count();
        $totalWarehouses = empty($warehouseIds)
            ? 0
            : Warehouse::whereIn('id', $warehouseIds)->where('is_active', true)->count();

        if (empty($warehouseIds)) {
            return $this->emptyDashboard($totalProducts, $activeCategories);
        }

        // Inventory valuation & on-hand totals
        $valuationRow = DB::table('inventory_stocks as s')
            ->join('products as p', 'p.id', '=', 's.product_id')
            ->whereNull('p.deleted_at')
            ->whereIn('s.warehouse_id', $warehouseIds)
            ->selectRaw('COALESCE(SUM(s.quantity_on_hand), 0) as total_units')
            ->selectRaw('COALESCE(SUM(s.reserved_quantity), 0) as total_reserved')
            ->selectRaw('COALESCE(SUM(s.quantity_on_hand * p.unit_cost), 0) as total_value')
            ->first();

        $totalValue = round((float) ($valuationRow->total_value ?? 0), 2);
        $totalUnits = (int) ($valuationRow->total_units ?? 0);
        $totalReserved = (int) ($valuationRow->total_reserved ?? 0);

        // Low stock & out-of-stock alerts across scoped warehouses
        $productStockAgg = DB::table('products as p')
            ->leftJoin('inventory_stocks as s', function ($join) use ($warehouseIds) {
                $join->on('s.product_id', '=', 'p.id')
                    ->whereIn('s.warehouse_id', $warehouseIds);
            })
            ->whereNull('p.deleted_at')
            ->where('p.is_active', true)
            ->groupBy('p.id', 'p.sku', 'p.name', 'p.unit_of_measure', 'p.min_stock_level', 'p.reorder_quantity', 'p.unit_cost')
            ->select([
                'p.id',
                'p.sku',
                'p.name',
                'p.unit_of_measure',
                'p.min_stock_level',
                'p.reorder_quantity',
                'p.unit_cost',
                DB::raw('COALESCE(SUM(s.quantity_on_hand), 0) as on_hand'),
                DB::raw('COALESCE(SUM(GREATEST(s.quantity_on_hand - s.reserved_quantity, 0)), 0) as available'),
            ])
            ->get();

        $lowStockItems = $productStockAgg->filter(fn ($row) => (int) $row->min_stock_level > 0 && (int) $row->available <= (int) $row->min_stock_level);
        $outOfStockCount = $productStockAgg->filter(fn ($row) => (int) $row->available === 0)->count();

        $lowStockAlerts = $lowStockItems
            ->sortBy(fn ($r) => ((int) $r->available) - ((int) $r->min_stock_level))
            ->take(8)
            ->values()
            ->map(fn ($r) => [
                'product_id' => (int) $r->id,
                'sku' => $r->sku,
                'name' => $r->name,
                'unit_of_measure' => $r->unit_of_measure,
                'available_quantity' => (int) $r->available,
                'on_hand_quantity' => (int) $r->on_hand,
                'min_stock_level' => (int) $r->min_stock_level,
                'deficit' => max(0, (int) $r->min_stock_level - (int) $r->available),
                'reorder_quantity' => (int) $r->reorder_quantity,
            ])->all();

        // Daily movement & reconstructed valuation trends
        $startDate = Carbon::today()->subDays($days - 1);
        $dailyRows = DB::table('stock_movements')
            ->whereIn('warehouse_id', $warehouseIds)
            ->where('occurred_at', '>=', $startDate->copy()->startOfDay())
            ->selectRaw('DATE(occurred_at) as day')
            ->selectRaw('COALESCE(SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END), 0) as inbound_qty')
            ->selectRaw('COALESCE(SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END), 0) as outbound_qty')
            ->selectRaw('COALESCE(SUM(quantity_change * unit_cost), 0) as net_value_delta')
            ->groupBy(DB::raw('DATE(occurred_at)'))
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $dates = [];
        for ($i = 0; $i < $days; $i++) {
            $dates[] = $startDate->copy()->addDays($i)->toDateString();
        }

        // Reconstruct closing daily inventory value backwards from today's exact valuation
        $closingValues = [];
        $runningValue = $totalValue;
        for ($i = count($dates) - 1; $i >= 0; $i--) {
            $d = $dates[$i];
            $closingValues[$d] = max(0, round($runningValue, 2));
            $delta = (float) ($dailyRows->get($d)->net_value_delta ?? 0);
            $runningValue -= $delta;
        }

        $movementTrends = [];
        foreach ($dates as $d) {
            $row = $dailyRows->get($d);
            $movementTrends[] = [
                'date' => $d,
                'label' => Carbon::parse($d)->format('M d'),
                'inbound' => (int) ($row->inbound_qty ?? 0),
                'outbound' => (int) ($row->outbound_qty ?? 0),
                'inventory_value' => $closingValues[$d],
            ];
        }

        // Warehouse distribution
        $warehouseDist = DB::table('warehouses as w')
            ->leftJoin('inventory_stocks as s', 's.warehouse_id', '=', 'w.id')
            ->leftJoin('products as p', function ($join) {
                $join->on('p.id', '=', 's.product_id')->whereNull('p.deleted_at');
            })
            ->whereNull('w.deleted_at')
            ->where('w.is_active', true)
            ->whereIn('w.id', $warehouseIds)
            ->groupBy('w.id', 'w.code', 'w.name')
            ->select([
                'w.id',
                'w.code',
                'w.name',
                DB::raw('COALESCE(SUM(s.quantity_on_hand), 0) as total_units'),
                DB::raw('COALESCE(SUM(s.quantity_on_hand * COALESCE(p.unit_cost, 0)), 0) as total_value'),
                DB::raw('COUNT(DISTINCT CASE WHEN s.quantity_on_hand > 0 THEN s.product_id END) as active_skus'),
            ])
            ->orderByDesc('total_value')
            ->get()
            ->map(fn ($w) => [
                'warehouse_id' => (int) $w->id,
                'code' => $w->code,
                'name' => $w->name,
                'total_units' => (int) $w->total_units,
                'total_value' => round((float) $w->total_value, 2),
                'active_skus' => (int) $w->active_skus,
            ])->all();

        // Top moving products (last 30 days)
        $topMoving = DB::table('stock_movements as m')
            ->join('products as p', 'p.id', '=', 'm.product_id')
            ->whereIn('m.warehouse_id', $warehouseIds)
            ->where('m.occurred_at', '>=', now()->subDays(30))
            ->groupBy('p.id', 'p.sku', 'p.name', 'p.unit_of_measure')
            ->select([
                'p.id as product_id',
                'p.sku',
                'p.name',
                'p.unit_of_measure',
                DB::raw('SUM(ABS(m.quantity_change)) as total_moved'),
                DB::raw('SUM(CASE WHEN m.quantity_change > 0 THEN m.quantity_change ELSE 0 END) as inbound_units'),
                DB::raw('SUM(CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change) ELSE 0 END) as outbound_units'),
            ])
            ->orderByDesc('total_moved')
            ->limit(6)
            ->get()
            ->map(fn ($r) => [
                'product_id' => (int) $r->product_id,
                'sku' => $r->sku,
                'name' => $r->name,
                'unit_of_measure' => $r->unit_of_measure,
                'total_moved' => (int) $r->total_moved,
                'inbound_units' => (int) $r->inbound_units,
                'outbound_units' => (int) $r->outbound_units,
            ])->all();

        // Recent operational activities
        $recentStockIn = StockMovement::with(['product:id,sku,name', 'warehouse:id,code,name', 'performer:id,name'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->whereIn('movement_type', ['stock_in', 'purchase_receipt'])
            ->orderByDesc('occurred_at')
            ->limit(5)
            ->get();

        $recentStockOut = StockMovement::with(['product:id,sku,name', 'warehouse:id,code,name', 'performer:id,name'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->where('movement_type', 'stock_out')
            ->orderByDesc('occurred_at')
            ->limit(5)
            ->get();

        $recentPOs = PurchaseOrder::with(['supplier:id,code,company_name', 'warehouse:id,code,name'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        $recentTransfers = StockTransfer::with(['sourceWarehouse:id,code,name', 'destinationWarehouse:id,code,name'])
            ->where(function ($q) use ($warehouseIds) {
                $q->whereIn('source_warehouse_id', $warehouseIds)
                    ->orWhereIn('destination_warehouse_id', $warehouseIds);
            })
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        $pendingTransfersCount = StockTransfer::where('status', 'pending')
            ->where(function ($q) use ($warehouseIds) {
                $q->whereIn('source_warehouse_id', $warehouseIds)
                    ->orWhereIn('destination_warehouse_id', $warehouseIds);
            })->count();

        $pendingAdjustmentsCount = StockAdjustment::where('status', 'pending')
            ->whereIn('warehouse_id', $warehouseIds)
            ->count();

        $openPoCount = PurchaseOrder::whereIn('status', ['approved', 'partially_received'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->count();

        return [
            'kpis' => [
                'total_products' => $totalProducts,
                'active_categories' => $activeCategories,
                'total_inventory_value' => $totalValue,
                'total_units_on_hand' => $totalUnits,
                'total_reserved_units' => $totalReserved,
                'low_stock_count' => $lowStockItems->count(),
                'out_of_stock_count' => $outOfStockCount,
                'total_warehouses' => $totalWarehouses,
                'pending_transfers' => $pendingTransfersCount,
                'pending_adjustments' => $pendingAdjustmentsCount,
                'open_purchase_orders' => $openPoCount,
            ],
            'movement_trends' => $movementTrends,
            'warehouse_distribution' => $warehouseDist,
            'top_moving_products' => $topMoving,
            'low_stock_alerts' => $lowStockAlerts,
            'recent_activity' => [
                'stock_in' => $recentStockIn,
                'stock_out' => $recentStockOut,
                'purchase_orders' => $recentPOs,
                'transfers' => $recentTransfers,
            ],
        ];
    }

    public function resolveScopedWarehouseIds(User $user, ?int $warehouseFilter = null): array
    {
        $accessible = $user->accessibleWarehouseIds();
        if ($warehouseFilter !== null) {
            return in_array($warehouseFilter, $accessible, true) ? [$warehouseFilter] : [];
        }
        return $accessible;
    }

    private function emptyDashboard(int $totalProducts, int $activeCategories): array
    {
        return [
            'kpis' => [
                'total_products' => $totalProducts,
                'active_categories' => $activeCategories,
                'total_inventory_value' => 0,
                'total_units_on_hand' => 0,
                'total_reserved_units' => 0,
                'low_stock_count' => 0,
                'out_of_stock_count' => 0,
                'total_warehouses' => 0,
                'pending_transfers' => 0,
                'pending_adjustments' => 0,
                'open_purchase_orders' => 0,
            ],
            'movement_trends' => [],
            'warehouse_distribution' => [],
            'top_moving_products' => [],
            'low_stock_alerts' => [],
            'recent_activity' => [
                'stock_in' => [],
                'stock_out' => [],
                'purchase_orders' => [],
                'transfers' => [],
            ],
        ];
    }
}
