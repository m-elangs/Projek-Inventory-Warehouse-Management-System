<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Exceptions\InsufficientStockException;
use App\Models\InventoryStock;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseLocation;
use Illuminate\Support\Facades\DB;

class InventoryLedgerService
{
    public function __construct(
        private readonly DocumentNumberService $docNumber
    ) {}

    /**
     * Atomically applies one or more stock mutations with deterministic row locking.
     *
     * @param  array<int, array<string, mixed>>  $entries
     * @return array<int, StockMovement>
     */
    public function applyMovements(array $entries, User $actor): array
    {
        if (empty($entries)) {
            throw new DomainRuleException('At least one stock movement entry is required.');
        }

        return DB::transaction(function () use ($entries, $actor) {
            // Normalize & validate location ownership first
            $normalized = [];
            foreach ($entries as $idx => $entry) {
                $qtyChange = (int) ($entry['quantity_change'] ?? 0);
                if ($qtyChange === 0) {
                    continue;
                }

                $warehouseId = (int) $entry['warehouse_id'];
                $productId = (int) $entry['product_id'];
                $locationId = !empty($entry['warehouse_location_id']) ? (int) $entry['warehouse_location_id'] : null;

                if ($locationId !== null) {
                    $validLoc = WarehouseLocation::where('id', $locationId)
                        ->where('warehouse_id', $warehouseId)
                        ->exists();
                    if (!$validLoc) {
                        throw new DomainRuleException("Storage location #{$locationId} does not belong to warehouse #{$warehouseId}.", [
                            "items.{$idx}.warehouse_location_id" => ['Selected storage location does not belong to the target warehouse.'],
                        ]);
                    }
                }

                $normalized[] = array_merge($entry, [
                    '_orig_index' => $idx,
                    'warehouse_id' => $warehouseId,
                    'product_id' => $productId,
                    'warehouse_location_id' => $locationId,
                    'location_key' => $locationId ?? 0,
                    'quantity_change' => $qtyChange,
                    'release_reserved' => max(0, (int) ($entry['release_reserved'] ?? 0)),
                ]);
            }

            if (empty($normalized)) {
                throw new DomainRuleException('Movement quantities must be non-zero.');
            }

            // Deterministic lock ordering by (warehouse_id, product_id, location_key) to prevent MySQL deadlocks
            $slots = [];
            foreach ($normalized as $item) {
                $slotKey = "{$item['warehouse_id']}:{$item['product_id']}:{$item['location_key']}";
                $slots[$slotKey] = [
                    'warehouse_id' => $item['warehouse_id'],
                    'product_id' => $item['product_id'],
                    'warehouse_location_id' => $item['warehouse_location_id'],
                    'location_key' => $item['location_key'],
                ];
            }

            ksort($slots, SORT_NATURAL);

            /** @var array<string, InventoryStock> $lockedStocks */
            $lockedStocks = [];
            foreach ($slots as $slotKey => $slot) {
                $lockedStocks[$slotKey] = $this->lockOrCreateStockSlot(
                    $slot['warehouse_id'],
                    $slot['product_id'],
                    $slot['warehouse_location_id']
                );
            }

            $movements = [];
            foreach ($normalized as $item) {
                $slotKey = "{$item['warehouse_id']}:{$item['product_id']}:{$item['location_key']}";
                $stock = $lockedStocks[$slotKey];

                $balanceBefore = (int) $stock->quantity_on_hand;
                $qtyChange = (int) $item['quantity_change'];
                $releaseReserved = (int) $item['release_reserved'];
                $balanceAfter = $balanceBefore + $qtyChange;
                $reservedAfter = max(0, (int) $stock->reserved_quantity - $releaseReserved);

                if ($balanceAfter < 0) {
                    $product = Product::find($item['product_id']);
                    $warehouse = Warehouse::find($item['warehouse_id']);
                    $sku = $product?->sku ?? "#{$item['product_id']}";
                    $whCode = $warehouse?->code ?? "#{$item['warehouse_id']}";

                    throw new InsufficientStockException(
                        "Insufficient stock in {$whCode} for {$sku}. Available on hand: {$balanceBefore}, attempted deduction: " . abs($qtyChange) . '.',
                        [
                            "items.{$item['_orig_index']}.quantity" => [
                                "Requested " . abs($qtyChange) . " units of {$sku}, but only {$balanceBefore} units are on hand in {$whCode}.",
                            ],
                        ]
                    );
                }

                // Ensure unreserved deductions cannot consume stock reserved for pending transfers
                if ($qtyChange < 0 && $balanceAfter < $reservedAfter) {
                    $product = Product::find($item['product_id']);
                    $warehouse = Warehouse::find($item['warehouse_id']);
                    $sku = $product?->sku ?? "#{$item['product_id']}";
                    $whCode = $warehouse?->code ?? "#{$item['warehouse_id']}";
                    $available = max(0, $balanceBefore - (int) $stock->reserved_quantity);

                    throw new InsufficientStockException(
                        "Insufficient available stock in {$whCode} for {$sku}.",
                        [
                            "items.{$item['_orig_index']}.quantity" => [
                                "Requested " . abs($qtyChange) . " units of {$sku}, but only {$available} units are available ({$balanceBefore} on hand, {$stock->reserved_quantity} reserved for pending transfers).",
                            ],
                        ]
                    );
                }

                $occurredAt = !empty($item['occurred_at']) ? $item['occurred_at'] : now();

                $stock->quantity_on_hand = $balanceAfter;
                $stock->reserved_quantity = $reservedAfter;
                $stock->last_movement_at = $occurredAt;
                $stock->save();

                $unitCost = isset($item['unit_cost'])
                    ? (float) $item['unit_cost']
                    : (float) (Product::whereKey($item['product_id'])->value('unit_cost') ?? 0);

                $movements[] = StockMovement::create([
                    'movement_number' => $this->docNumber->generate('MOV', 'stock_movements', 'movement_number'),
                    'warehouse_id' => $item['warehouse_id'],
                    'warehouse_location_id' => $item['warehouse_location_id'],
                    'product_id' => $item['product_id'],
                    'movement_type' => (string) $item['movement_type'],
                    'quantity_change' => $qtyChange,
                    'balance_before' => $balanceBefore,
                    'balance_after' => $balanceAfter,
                    'unit_cost' => $unitCost,
                    'reference_type' => (string) $item['reference_type'],
                    'reference_id' => $item['reference_id'] ?? null,
                    'reference_number' => (string) $item['reference_number'],
                    'destination' => $item['destination'] ?? null,
                    'notes' => $item['notes'] ?? null,
                    'performed_by' => $actor->id,
                    'occurred_at' => $occurredAt,
                ]);
            }

            return $movements;
        });
    }

    /**
     * Reserves stock at a source warehouse for a pending Stock Transfer.
     *
     * @param  array<int, array{product_id:int, quantity:int, warehouse_location_id?:int|null}>  $items
     */
    public function reserveStock(int $warehouseId, array $items): void
    {
        DB::transaction(function () use ($warehouseId, $items) {
            $sorted = $this->aggregateAndSortReservationItems($items);

            foreach ($sorted as $slot) {
                $stock = $this->lockOrCreateStockSlot($warehouseId, $slot['product_id'], $slot['warehouse_location_id']);
                $available = max(0, (int) $stock->quantity_on_hand - (int) $stock->reserved_quantity);

                if ($available < $slot['quantity']) {
                    $product = Product::find($slot['product_id']);
                    $warehouse = Warehouse::find($warehouseId);
                    $sku = $product?->sku ?? "#{$slot['product_id']}";
                    $whCode = $warehouse?->code ?? "#{$warehouseId}";

                    throw new InsufficientStockException(
                        "Insufficient available stock in {$whCode} for {$sku} to reserve transfer.",
                        [
                            'items' => [
                                "Cannot reserve {$slot['quantity']} units of {$sku} in {$whCode}: only {$available} available ({$stock->quantity_on_hand} on hand, {$stock->reserved_quantity} reserved).",
                            ],
                        ]
                    );
                }

                $stock->reserved_quantity = (int) $stock->reserved_quantity + $slot['quantity'];
                $stock->save();
            }
        });
    }

    /**
     * Releases previously reserved stock (e.g., when cancelling a pending transfer).
     *
     * @param  array<int, array{product_id:int, quantity:int, warehouse_location_id?:int|null}>  $items
     */
    public function releaseReservation(int $warehouseId, array $items): void
    {
        DB::transaction(function () use ($warehouseId, $items) {
            $sorted = $this->aggregateAndSortReservationItems($items);

            foreach ($sorted as $slot) {
                $stock = $this->lockOrCreateStockSlot($warehouseId, $slot['product_id'], $slot['warehouse_location_id']);
                $stock->reserved_quantity = max(0, (int) $stock->reserved_quantity - $slot['quantity']);
                $stock->save();
            }
        });
    }

    public function lockOrCreateStockSlot(int $warehouseId, int $productId, ?int $locationId): InventoryStock
    {
        $query = InventoryStock::where('warehouse_id', $warehouseId)
            ->where('product_id', $productId);

        if ($locationId === null) {
            $query->whereNull('warehouse_location_id');
        } else {
            $query->where('warehouse_location_id', $locationId);
        }

        $stock = $query->lockForUpdate()->first();
        if ($stock) {
            return $stock;
        }

        DB::table('inventory_stocks')->insertOrIgnore([
            'warehouse_id' => $warehouseId,
            'warehouse_location_id' => $locationId,
            'product_id' => $productId,
            'quantity_on_hand' => 0,
            'reserved_quantity' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $retryQuery = InventoryStock::where('warehouse_id', $warehouseId)
            ->where('product_id', $productId);

        if ($locationId === null) {
            $retryQuery->whereNull('warehouse_location_id');
        } else {
            $retryQuery->where('warehouse_location_id', $locationId);
        }

        return $retryQuery->lockForUpdate()->firstOrFail();
    }

    private function aggregateAndSortReservationItems(array $items): array
    {
        $grouped = [];
        foreach ($items as $item) {
            $productId = (int) $item['product_id'];
            $locId = !empty($item['warehouse_location_id']) ? (int) $item['warehouse_location_id'] : null;
            $locKey = $locId ?? 0;
            $key = "{$productId}:{$locKey}";

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'product_id' => $productId,
                    'warehouse_location_id' => $locId,
                    'quantity' => 0,
                ];
            }
            $grouped[$key]['quantity'] += (int) $item['quantity'];
        }

        ksort($grouped, SORT_NATURAL);

        return array_values($grouped);
    }
}
