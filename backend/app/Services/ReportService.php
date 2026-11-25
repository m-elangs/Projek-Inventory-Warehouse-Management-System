<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ReportService
{
    public function __construct(
        private readonly DashboardAnalyticsService $dashboardService
    ) {}

    public function getInventoryValuationReport(User $user, array $filters = []): array
    {
        $warehouseFilter = !empty($filters['warehouse_id']) ? (int) $filters['warehouse_id'] : null;
        $warehouseIds = $this->dashboardService->resolveScopedWarehouseIds($user, $warehouseFilter);

        if (empty($warehouseIds)) {
            return [
                'summary' => [
                    'total_skus' => 0,
                    'total_units_on_hand' => 0,
                    'total_available_units' => 0,
                    'total_reserved_units' => 0,
                    'total_valuation' => 0,
                    'healthy_count' => 0,
                    'low_stock_count' => 0,
                    'out_of_stock_count' => 0,
                ],
                'by_category' => [],
                'items' => [],
            ];
        }

        $query = DB::table('products as p')
            ->join('categories as c', 'c.id', '=', 'p.category_id')
            ->leftJoin('inventory_stocks as s', function ($join) use ($warehouseIds) {
                $join->on('s.product_id', '=', 'p.id')
                    ->whereIn('s.warehouse_id', $warehouseIds);
            })
            ->whereNull('p.deleted_at');

        if (!empty($filters['category_id'])) {
            $query->where('p.category_id', (int) $filters['category_id']);
        }

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function ($q) use ($search) {
                $q->where('p.sku', 'like', "%{$search}%")
                    ->orWhere('p.name', 'like', "%{$search}%");
            });
        }

        $rows = $query
            ->groupBy('p.id', 'p.sku', 'p.name', 'p.unit_of_measure', 'p.unit_cost', 'p.selling_price', 'p.min_stock_level', 'c.id', 'c.name')
            ->select([
                'p.id as product_id',
                'p.sku',
                'p.name as product_name',
                'p.unit_of_measure',
                'p.unit_cost',
                'p.selling_price',
                'p.min_stock_level',
                'c.id as category_id',
                'c.name as category_name',
                DB::raw('COALESCE(SUM(s.quantity_on_hand), 0) as quantity_on_hand'),
                DB::raw('COALESCE(SUM(s.reserved_quantity), 0) as reserved_quantity'),
                DB::raw('MAX(s.last_movement_at) as last_movement_at'),
            ])
            ->orderBy('p.name')
            ->get();

        $items = [];
        $categoryTotals = [];
        $totalUnits = 0;
        $totalReserved = 0;
        $totalAvailable = 0;
        $totalValuation = 0.0;
        $healthyCount = 0;
        $lowStockCount = 0;
        $outOfStockCount = 0;

        foreach ($rows as $r) {
            $onHand = (int) $r->quantity_on_hand;
            $reserved = (int) $r->reserved_quantity;
            $available = max(0, $onHand - $reserved);
            $minStock = (int) $r->min_stock_level;
            $unitCost = (float) $r->unit_cost;
            $stockValue = round($onHand * $unitCost, 2);

            $healthStatus = 'healthy';
            if ($available === 0) {
                $healthStatus = 'out_of_stock';
            } elseif ($minStock > 0 && $available <= $minStock) {
                $healthStatus = 'low_stock';
            }

            if (!empty($filters['health_status']) && $filters['health_status'] !== $healthStatus) {
                continue;
            }

            if ($healthStatus === 'healthy') {
                $healthyCount++;
            } elseif ($healthStatus === 'low_stock') {
                $lowStockCount++;
            } else {
                $outOfStockCount++;
            }

            $totalUnits += $onHand;
            $totalReserved += $reserved;
            $totalAvailable += $available;
            $totalValuation += $stockValue;

            $catKey = (int) $r->category_id;
            if (!isset($categoryTotals[$catKey])) {
                $categoryTotals[$catKey] = [
                    'category_id' => $catKey,
                    'category_name' => $r->category_name,
                    'sku_count' => 0,
                    'total_units' => 0,
                    'total_value' => 0.0,
                ];
            }
            $categoryTotals[$catKey]['sku_count']++;
            $categoryTotals[$catKey]['total_units'] += $onHand;
            $categoryTotals[$catKey]['total_value'] = round($categoryTotals[$catKey]['total_value'] + $stockValue, 2);

            $items[] = [
                'product_id' => (int) $r->product_id,
                'sku' => $r->sku,
                'product_name' => $r->product_name,
                'category_name' => $r->category_name,
                'unit_of_measure' => $r->unit_of_measure,
                'quantity_on_hand' => $onHand,
                'reserved_quantity' => $reserved,
                'available_quantity' => $available,
                'min_stock_level' => $minStock,
                'unit_cost' => round($unitCost, 2),
                'stock_value' => $stockValue,
                'health_status' => $healthStatus,
                'last_movement_at' => $r->last_movement_at,
            ];
        }

        usort($categoryTotals, fn ($a, $b) => $b['total_value'] <=> $a['total_value']);

        return [
            'summary' => [
                'total_skus' => count($items),
                'total_units_on_hand' => $totalUnits,
                'total_available_units' => $totalAvailable,
                'total_reserved_units' => $totalReserved,
                'total_valuation' => round($totalValuation, 2),
                'healthy_count' => $healthyCount,
                'low_stock_count' => $lowStockCount,
                'out_of_stock_count' => $outOfStockCount,
            ],
            'by_category' => array_values($categoryTotals),
            'items' => $items,
        ];
    }

    public function getTransactionReport(User $user, array $filters = []): array
    {
        $warehouseFilter = !empty($filters['warehouse_id']) ? (int) $filters['warehouse_id'] : null;
        $warehouseIds = $this->dashboardService->resolveScopedWarehouseIds($user, $warehouseFilter);

        $dateFrom = !empty($filters['date_from'])
            ? Carbon::parse($filters['date_from'])->startOfDay()
            : Carbon::today()->subDays(29)->startOfDay();

        $dateTo = !empty($filters['date_to'])
            ? Carbon::parse($filters['date_to'])->endOfDay()
            : Carbon::today()->endOfDay();

        if (empty($warehouseIds)) {
            return [
                'period' => ['date_from' => $dateFrom->toDateString(), 'date_to' => $dateTo->toDateString()],
                'summary' => [
                    'total_transactions' => 0,
                    'total_inbound_units' => 0,
                    'total_outbound_units' => 0,
                    'total_inbound_value' => 0,
                    'total_outbound_value' => 0,
                ],
                'by_type' => [],
                'movements' => [],
            ];
        }

        $baseQuery = DB::table('stock_movements as m')
            ->join('products as p', 'p.id', '=', 'm.product_id')
            ->join('warehouses as w', 'w.id', '=', 'm.warehouse_id')
            ->join('users as u', 'u.id', '=', 'm.performed_by')
            ->whereIn('m.warehouse_id', $warehouseIds)
            ->whereBetween('m.occurred_at', [$dateFrom, $dateTo]);

        if (!empty($filters['movement_type'])) {
            $baseQuery->where('m.movement_type', $filters['movement_type']);
        }

        if (!empty($filters['product_id'])) {
            $baseQuery->where('m.product_id', (int) $filters['product_id']);
        }

        $byType = (clone $baseQuery)
            ->groupBy('m.movement_type')
            ->select([
                'm.movement_type',
                DB::raw('COUNT(*) as transaction_count'),
                DB::raw('SUM(ABS(m.quantity_change)) as total_units'),
                DB::raw('SUM(ABS(m.quantity_change) * m.unit_cost) as total_value'),
            ])
            ->orderByDesc('transaction_count')
            ->get()
            ->map(fn ($r) => [
                'movement_type' => $r->movement_type,
                'transaction_count' => (int) $r->transaction_count,
                'total_units' => (int) $r->total_units,
                'total_value' => round((float) $r->total_value, 2),
            ])->all();

        $totals = (clone $baseQuery)
            ->selectRaw('COUNT(*) as tx_count')
            ->selectRaw('COALESCE(SUM(CASE WHEN m.quantity_change > 0 THEN m.quantity_change ELSE 0 END), 0) as inbound_units')
            ->selectRaw('COALESCE(SUM(CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change) ELSE 0 END), 0) as outbound_units')
            ->selectRaw('COALESCE(SUM(CASE WHEN m.quantity_change > 0 THEN m.quantity_change * m.unit_cost ELSE 0 END), 0) as inbound_value')
            ->selectRaw('COALESCE(SUM(CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change) * m.unit_cost ELSE 0 END), 0) as outbound_value')
            ->first();

        $movements = (clone $baseQuery)
            ->select([
                'm.id',
                'm.movement_number',
                'm.movement_type',
                'm.quantity_change',
                'm.balance_before',
                'm.balance_after',
                'm.unit_cost',
                'm.reference_type',
                'm.reference_number',
                'm.destination',
                'm.notes',
                'm.occurred_at',
                'p.sku',
                'p.name as product_name',
                'p.unit_of_measure',
                'w.code as warehouse_code',
                'w.name as warehouse_name',
                'u.name as performed_by_name',
            ])
            ->orderByDesc('m.occurred_at')
            ->orderByDesc('m.id')
            ->limit(500)
            ->get()
            ->map(fn ($m) => [
                'id' => (int) $m->id,
                'movement_number' => $m->movement_number,
                'movement_type' => $m->movement_type,
                'sku' => $m->sku,
                'product_name' => $m->product_name,
                'unit_of_measure' => $m->unit_of_measure,
                'warehouse_code' => $m->warehouse_code,
                'warehouse_name' => $m->warehouse_name,
                'quantity_change' => (int) $m->quantity_change,
                'balance_before' => (int) $m->balance_before,
                'balance_after' => (int) $m->balance_after,
                'unit_cost' => round((float) $m->unit_cost, 2),
                'line_value' => round(abs((int) $m->quantity_change) * (float) $m->unit_cost, 2),
                'reference_type' => $m->reference_type,
                'reference_number' => $m->reference_number,
                'destination' => $m->destination,
                'notes' => $m->notes,
                'performed_by_name' => $m->performed_by_name,
                'occurred_at' => $m->occurred_at,
            ])->all();

        return [
            'period' => [
                'date_from' => $dateFrom->toDateString(),
                'date_to' => $dateTo->toDateString(),
            ],
            'summary' => [
                'total_transactions' => (int) ($totals->tx_count ?? 0),
                'total_inbound_units' => (int) ($totals->inbound_units ?? 0),
                'total_outbound_units' => (int) ($totals->outbound_units ?? 0),
                'total_inbound_value' => round((float) ($totals->inbound_value ?? 0), 2),
                'total_outbound_value' => round((float) ($totals->outbound_value ?? 0), 2),
            ],
            'by_type' => $byType,
            'movements' => $movements,
        ];
    }
}
