<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockTransferService
{
    public function __construct(
        private readonly InventoryLedgerService $ledger,
        private readonly DocumentNumberService $docNumber,
        private readonly ActivityAuditService $audit
    ) {}

    public function create(array $data, User $actor): StockTransfer
    {
        return DB::transaction(function () use ($data, $actor) {
            $sourceWarehouseId = (int) $data['source_warehouse_id'];
            $destWarehouseId = (int) $data['destination_warehouse_id'];

            if ($sourceWarehouseId === $destWarehouseId) {
                throw new DomainRuleException('Source and destination warehouses must be different.', [
                    'destination_warehouse_id' => ['Destination warehouse cannot be the same as source warehouse.'],
                ]);
            }

            $reservationItems = [];
            $preparedItems = [];

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail((int) $item['product_id']);
                $qty = (int) $item['quantity'];
                $sourceLocId = !empty($item['source_location_id']) ? (int) $item['source_location_id'] : null;
                $destLocId = !empty($item['destination_location_id']) ? (int) $item['destination_location_id'] : null;

                $reservationItems[] = [
                    'product_id' => $product->id,
                    'warehouse_location_id' => $sourceLocId,
                    'quantity' => $qty,
                ];

                $preparedItems[] = [
                    'product_id' => $product->id,
                    'source_location_id' => $sourceLocId,
                    'destination_location_id' => $destLocId,
                    'quantity' => $qty,
                    'unit_cost' => (float) $product->unit_cost,
                ];
            }

            // Validate and reserve stock at source warehouse immediately
            $this->ledger->reserveStock($sourceWarehouseId, $reservationItems);

            $prefix = (string) SystemSetting::getValue('transfer_prefix', 'TRF');
            $transferNumber = $this->docNumber->generate($prefix, 'stock_transfers', 'transfer_number');

            $autoApprove = $actor->hasPermission('transfers.approve') && $actor->canAccessWarehouse($sourceWarehouseId);

            $transfer = StockTransfer::create([
                'transfer_number' => $transferNumber,
                'source_warehouse_id' => $sourceWarehouseId,
                'destination_warehouse_id' => $destWarehouseId,
                'transfer_date' => $data['transfer_date'],
                'status' => 'pending',
                'notes' => $data['notes'] ?? null,
                'requested_by' => $actor->id,
                'approved_by' => $autoApprove ? $actor->id : null,
                'approved_at' => $autoApprove ? now() : null,
            ]);

            foreach ($preparedItems as $item) {
                $transfer->items()->create($item);
            }

            $this->audit->log(
                'transfers',
                'created',
                "Created inter-warehouse transfer {$transfer->transfer_number} (pending).",
                $transfer,
                ['source_warehouse_id' => $sourceWarehouseId, 'destination_warehouse_id' => $destWarehouseId],
                $actor
            );

            // Optional immediate completion if explicitly requested and authorized
            if (!empty($data['complete_immediately']) && $actor->hasPermission('transfers.complete')) {
                return $this->complete($transfer, $actor);
            }

            return $this->loadRelations($transfer);
        });
    }

    public function approve(StockTransfer $transfer, User $actor): StockTransfer
    {
        return DB::transaction(function () use ($transfer, $actor) {
            $locked = StockTransfer::whereKey($transfer->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'pending') {
                throw new DomainRuleException("Only pending transfers can be approved (current status: {$locked->status}).", [], 409);
            }

            $locked->update([
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            $this->audit->log('transfers', 'approved', "Approved stock transfer {$locked->transfer_number}.", $locked, [], $actor);

            return $this->loadRelations($locked);
        });
    }

    public function complete(StockTransfer $transfer, User $actor): StockTransfer
    {
        return DB::transaction(function () use ($transfer, $actor) {
            $locked = StockTransfer::with(['items', 'sourceWarehouse', 'destinationWarehouse'])
                ->whereKey($transfer->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status !== 'pending') {
                throw new DomainRuleException(
                    "Transfer {$locked->transfer_number} cannot be completed because its status is '{$locked->status}'.",
                    [],
                    409
                );
            }

            $entries = [];
            foreach ($locked->items as $item) {
                // Source deduction + reservation release
                $entries[] = [
                    'warehouse_id' => $locked->source_warehouse_id,
                    'warehouse_location_id' => $item->source_location_id,
                    'product_id' => $item->product_id,
                    'movement_type' => 'transfer_out',
                    'quantity_change' => -((int) $item->quantity),
                    'release_reserved' => (int) $item->quantity,
                    'unit_cost' => (float) $item->unit_cost,
                    'reference_type' => 'stock_transfer',
                    'reference_id' => $locked->id,
                    'reference_number' => $locked->transfer_number,
                    'destination' => $locked->destinationWarehouse?->code,
                    'notes' => "Transfer to {$locked->destinationWarehouse?->name}",
                ];

                // Destination credit
                $entries[] = [
                    'warehouse_id' => $locked->destination_warehouse_id,
                    'warehouse_location_id' => $item->destination_location_id,
                    'product_id' => $item->product_id,
                    'movement_type' => 'transfer_in',
                    'quantity_change' => (int) $item->quantity,
                    'unit_cost' => (float) $item->unit_cost,
                    'reference_type' => 'stock_transfer',
                    'reference_id' => $locked->id,
                    'reference_number' => $locked->transfer_number,
                    'destination' => $locked->destinationWarehouse?->code,
                    'notes' => "Transfer from {$locked->sourceWarehouse?->name}",
                ];
            }

            // Single atomic call ensures deterministic lock order across both warehouses!
            $this->ledger->applyMovements($entries, $actor);

            $locked->update([
                'status' => 'completed',
                'approved_by' => $locked->approved_by ?? $actor->id,
                'approved_at' => $locked->approved_at ?? now(),
                'completed_by' => $actor->id,
                'completed_at' => now(),
            ]);

            $this->audit->log(
                'transfers',
                'completed',
                "Completed stock transfer {$locked->transfer_number}.",
                $locked,
                [],
                $actor
            );

            return $this->loadRelations($locked);
        });
    }

    public function cancel(StockTransfer $transfer, User $actor): StockTransfer
    {
        return DB::transaction(function () use ($transfer, $actor) {
            $locked = StockTransfer::with('items')->whereKey($transfer->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'pending') {
                throw new DomainRuleException(
                    "Only pending transfers can be cancelled (current status: {$locked->status}).",
                    [],
                    409
                );
            }

            $releaseItems = $locked->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'warehouse_location_id' => $item->source_location_id,
                'quantity' => (int) $item->quantity,
            ])->all();

            $this->ledger->releaseReservation($locked->source_warehouse_id, $releaseItems);

            $locked->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
            ]);

            $this->audit->log(
                'transfers',
                'cancelled',
                "Cancelled pending stock transfer {$locked->transfer_number} and released reserved stock.",
                $locked,
                [],
                $actor
            );

            return $this->loadRelations($locked);
        });
    }

    public function loadRelations(StockTransfer $transfer): StockTransfer
    {
        return $transfer->fresh([
            'sourceWarehouse:id,code,name',
            'destinationWarehouse:id,code,name',
            'requester:id,name,employee_code',
            'approver:id,name,employee_code',
            'completer:id,name,employee_code',
            'items.product:id,sku,name,unit_of_measure',
            'items.sourceLocation:id,code,name',
            'items.destinationLocation:id,code,name',
        ]);
    }
}
