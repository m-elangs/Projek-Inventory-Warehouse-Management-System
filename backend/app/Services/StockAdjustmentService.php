<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Models\InventoryStock;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockAdjustmentService
{
    public function __construct(
        private readonly InventoryLedgerService $ledger,
        private readonly DocumentNumberService $docNumber,
        private readonly ActivityAuditService $audit
    ) {}

    public function create(array $data, User $actor): StockAdjustment
    {
        return DB::transaction(function () use ($data, $actor) {
            $warehouseId = (int) $data['warehouse_id'];
            $prefix = (string) SystemSetting::getValue('adjustment_prefix', 'ADJ');
            $adjustmentNumber = $this->docNumber->generate($prefix, 'stock_adjustments', 'adjustment_number');

            $adjustment = StockAdjustment::create([
                'adjustment_number' => $adjustmentNumber,
                'warehouse_id' => $warehouseId,
                'adjustment_date' => $data['adjustment_date'],
                'reason' => $data['reason'],
                'status' => 'pending',
                'notes' => $data['notes'],
                'created_by' => $actor->id,
            ]);

            $hasMeaningfulChange = false;

            foreach ($data['items'] as $idx => $item) {
                $product = Product::findOrFail((int) $item['product_id']);
                $locationId = !empty($item['warehouse_location_id']) ? (int) $item['warehouse_location_id'] : null;
                $adjustedQty = (int) $item['adjusted_quantity'];

                if ($adjustedQty < 0) {
                    throw new DomainRuleException("Adjusted quantity for {$product->sku} cannot be negative.", [
                        "items.{$idx}.adjusted_quantity" => ['Adjusted quantity must be 0 or greater.'],
                    ]);
                }

                $stockQuery = InventoryStock::where('warehouse_id', $warehouseId)
                    ->where('product_id', $product->id);
                if ($locationId === null) {
                    $stockQuery->whereNull('warehouse_location_id');
                } else {
                    $stockQuery->where('warehouse_location_id', $locationId);
                }

                $currentStock = $stockQuery->first();
                $previousQty = (int) ($currentStock?->quantity_on_hand ?? 0);
                $reservedQty = (int) ($currentStock?->reserved_quantity ?? 0);

                if ($adjustedQty < $reservedQty) {
                    throw new DomainRuleException(
                        "Cannot adjust {$product->sku} to {$adjustedQty} because {$reservedQty} units are currently reserved in pending transfers.",
                        [
                            "items.{$idx}.adjusted_quantity" => [
                                "Must be at least {$reservedQty} (reserved for pending transfers).",
                            ],
                        ]
                    );
                }

                $diff = $adjustedQty - $previousQty;
                if ($diff !== 0) {
                    $hasMeaningfulChange = true;
                }

                $adjustment->items()->create([
                    'product_id' => $product->id,
                    'warehouse_location_id' => $locationId,
                    'previous_quantity' => $previousQty,
                    'adjusted_quantity' => $adjustedQty,
                    'difference_quantity' => $diff,
                    'unit_cost' => (float) $product->unit_cost,
                    'notes' => $item['notes'] ?? null,
                ]);
            }

            if (!$hasMeaningfulChange) {
                throw new DomainRuleException('Adjustment must change at least one product quantity from its current system balance.', [
                    'items' => ['All entered quantities match current on-hand balances; no adjustment needed.'],
                ]);
            }

            $this->audit->log(
                'adjustments',
                'created',
                "Submitted stock adjustment {$adjustment->adjustment_number} ({$adjustment->reason}).",
                $adjustment,
                ['warehouse_id' => $warehouseId, 'reason' => $adjustment->reason],
                $actor
            );

            $canAutoApprove = !empty($data['approve_immediately'])
                && $actor->hasPermission('adjustments.approve')
                && $actor->canAccessWarehouse($warehouseId);

            if ($canAutoApprove) {
                return $this->approve($adjustment, $actor);
            }

            return $this->loadRelations($adjustment);
        });
    }

    public function approve(StockAdjustment $adjustment, User $actor): StockAdjustment
    {
        return DB::transaction(function () use ($adjustment, $actor) {
            $locked = StockAdjustment::with('items')
                ->whereKey($adjustment->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status !== 'pending') {
                throw new DomainRuleException(
                    "Stock adjustment {$locked->adjustment_number} has already been {$locked->status}.",
                    [],
                    409
                );
            }

            $entries = [];
            foreach ($locked->items as $item) {
                $stock = $this->ledger->lockOrCreateStockSlot(
                    $locked->warehouse_id,
                    $item->product_id,
                    $item->warehouse_location_id
                );

                $livePrevious = (int) $stock->quantity_on_hand;
                $targetAdjusted = (int) $item->adjusted_quantity;
                $liveDiff = $targetAdjusted - $livePrevious;

                // Update snapshot to exact pre-execution balance
                $item->update([
                    'previous_quantity' => $livePrevious,
                    'difference_quantity' => $liveDiff,
                ]);

                if ($liveDiff === 0) {
                    continue;
                }

                $entries[] = [
                    'warehouse_id' => $locked->warehouse_id,
                    'warehouse_location_id' => $item->warehouse_location_id,
                    'product_id' => $item->product_id,
                    'movement_type' => $liveDiff > 0 ? 'adjustment_in' : 'adjustment_out',
                    'quantity_change' => $liveDiff,
                    'unit_cost' => (float) $item->unit_cost,
                    'reference_type' => 'stock_adjustment',
                    'reference_id' => $locked->id,
                    'reference_number' => $locked->adjustment_number,
                    'notes' => "Adjustment ({$locked->reason}): {$locked->notes}",
                ];
            }

            if (!empty($entries)) {
                $this->ledger->applyMovements($entries, $actor);
            }

            $locked->update([
                'status' => 'approved',
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            $this->audit->log(
                'adjustments',
                'approved',
                "Approved stock adjustment {$locked->adjustment_number}.",
                $locked,
                ['movements_posted' => count($entries)],
                $actor
            );

            return $this->loadRelations($locked);
        });
    }

    public function reject(StockAdjustment $adjustment, string $rejectionReason, User $actor): StockAdjustment
    {
        return DB::transaction(function () use ($adjustment, $rejectionReason, $actor) {
            $locked = StockAdjustment::whereKey($adjustment->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'pending') {
                throw new DomainRuleException(
                    "Stock adjustment {$locked->adjustment_number} has already been {$locked->status}.",
                    [],
                    409
                );
            }

            $locked->update([
                'status' => 'rejected',
                'approved_by' => $actor->id,
                'rejected_at' => now(),
                'rejection_reason' => $rejectionReason,
            ]);

            $this->audit->log(
                'adjustments',
                'rejected',
                "Rejected stock adjustment {$locked->adjustment_number}.",
                $locked,
                ['rejection_reason' => $rejectionReason],
                $actor
            );

            return $this->loadRelations($locked);
        });
    }

    public function loadRelations(StockAdjustment $adjustment): StockAdjustment
    {
        return $adjustment->fresh([
            'warehouse:id,code,name',
            'creator:id,name,employee_code',
            'approver:id,name,employee_code',
            'items.product:id,sku,name,unit_of_measure',
            'items.location:id,code,name',
        ]);
    }
}
