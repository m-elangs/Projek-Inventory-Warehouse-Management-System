<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Product;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class StockOperationService
{
    public function __construct(
        private readonly InventoryLedgerService $ledger,
        private readonly DocumentNumberService $docNumber,
        private readonly ActivityAuditService $audit
    ) {}

    public function recordDirectStockIn(array $data, User $actor): GoodsReceipt
    {
        return DB::transaction(function () use ($data, $actor) {
            $prefix = (string) SystemSetting::getValue('receipt_prefix', 'GRN');
            $receiptNumber = !empty($data['reference_number'])
                ? strtoupper(trim((string) $data['reference_number']))
                : $this->docNumber->generate($prefix, 'goods_receipts', 'receipt_number');

            if (GoodsReceipt::where('receipt_number', $receiptNumber)->exists()) {
                throw new DomainRuleException("Reference number {$receiptNumber} already exists.", [
                    'reference_number' => ['This receipt reference number has already been used.'],
                ]);
            }

            $receiptDate = !empty($data['transaction_date'])
                ? Carbon::parse($data['transaction_date'])
                : now();

            $receipt = GoodsReceipt::create([
                'receipt_number' => $receiptNumber,
                'receipt_type' => 'direct_stock_in',
                'purchase_order_id' => $data['purchase_order_id'] ?? null,
                'supplier_id' => $data['supplier_id'] ?? null,
                'warehouse_id' => (int) $data['warehouse_id'],
                'receipt_date' => $receiptDate->toDateString(),
                'supplier_delivery_note' => $data['supplier_delivery_note'] ?? null,
                'status' => 'completed',
                'notes' => $data['notes'] ?? null,
                'received_by' => $actor->id,
            ]);

            $ledgerEntries = [];
            foreach ($data['items'] as $idx => $item) {
                $product = Product::findOrFail((int) $item['product_id']);
                if (!$product->is_active) {
                    throw new DomainRuleException("Product {$product->sku} is inactive and cannot receive stock.", [
                        "items.{$idx}.product_id" => ["Product {$product->sku} is inactive."],
                    ]);
                }

                $unitCost = isset($item['unit_cost']) && $item['unit_cost'] !== ''
                    ? (float) $item['unit_cost']
                    : (float) $product->unit_cost;

                $locationId = !empty($item['warehouse_location_id'])
                    ? (int) $item['warehouse_location_id']
                    : (!empty($data['warehouse_location_id']) ? (int) $data['warehouse_location_id'] : null);

                GoodsReceiptItem::create([
                    'goods_receipt_id' => $receipt->id,
                    'purchase_order_item_id' => null,
                    'product_id' => $product->id,
                    'warehouse_location_id' => $locationId,
                    'quantity_received' => (int) $item['quantity'],
                    'unit_cost' => $unitCost,
                    'notes' => $item['notes'] ?? null,
                ]);

                $ledgerEntries[] = [
                    'warehouse_id' => $receipt->warehouse_id,
                    'warehouse_location_id' => $locationId,
                    'product_id' => $product->id,
                    'movement_type' => 'stock_in',
                    'quantity_change' => (int) $item['quantity'],
                    'unit_cost' => $unitCost,
                    'reference_type' => 'goods_receipt',
                    'reference_id' => $receipt->id,
                    'reference_number' => $receipt->receipt_number,
                    'notes' => $item['notes'] ?? $data['notes'] ?? null,
                    'occurred_at' => $receiptDate->isToday() ? now() : $receiptDate->copy()->setTimeFrom(now()),
                ];
            }

            $this->ledger->applyMovements($ledgerEntries, $actor);

            $this->audit->log(
                'inventory',
                'stock_in',
                "Recorded Stock In {$receipt->receipt_number} into warehouse #{$receipt->warehouse_id}.",
                $receipt,
                ['item_count' => count($ledgerEntries)],
                $actor
            );

            return $receipt->load(['warehouse:id,code,name', 'supplier:id,code,company_name', 'receiver:id,name', 'items.product:id,sku,name,unit_of_measure', 'items.location:id,code,name']);
        });
    }

    public function recordStockOut(array $data, User $actor): array
    {
        return DB::transaction(function () use ($data, $actor) {
            $referenceNumber = !empty($data['reference_number'])
                ? strtoupper(trim((string) $data['reference_number']))
                : $this->docNumber->generate('OUT', 'stock_movements', 'reference_number');

            $txDate = !empty($data['transaction_date'])
                ? Carbon::parse($data['transaction_date'])
                : now();

            $ledgerEntries = [];
            foreach ($data['items'] as $idx => $item) {
                $product = Product::findOrFail((int) $item['product_id']);
                $qty = (int) $item['quantity'];

                $locationId = !empty($item['warehouse_location_id'])
                    ? (int) $item['warehouse_location_id']
                    : (!empty($data['warehouse_location_id']) ? (int) $data['warehouse_location_id'] : null);

                $ledgerEntries[] = [
                    'warehouse_id' => (int) $data['warehouse_id'],
                    'warehouse_location_id' => $locationId,
                    'product_id' => $product->id,
                    'movement_type' => 'stock_out',
                    'quantity_change' => -$qty,
                    'unit_cost' => (float) $product->unit_cost,
                    'reference_type' => 'stock_out',
                    'reference_id' => null,
                    'reference_number' => $referenceNumber,
                    'destination' => $data['destination'] ?? null,
                    'notes' => $item['notes'] ?? $data['notes'] ?? null,
                    'occurred_at' => $txDate->isToday() ? now() : $txDate->copy()->setTimeFrom(now()),
                ];
            }

            $movements = $this->ledger->applyMovements($ledgerEntries, $actor);

            $this->audit->log(
                'inventory',
                'stock_out',
                "Recorded Stock Out {$referenceNumber} from warehouse #{$data['warehouse_id']}.",
                $movements[0] ?? null,
                [
                    'reference_number' => $referenceNumber,
                    'destination' => $data['destination'] ?? null,
                    'item_count' => count($movements),
                ],
                $actor
            );

            return [
                'reference_number' => $referenceNumber,
                'movements' => collect($movements)->map(fn ($m) => $m->load([
                    'warehouse:id,code,name',
                    'location:id,code,name',
                    'product:id,sku,name,unit_of_measure',
                    'performer:id,name',
                ]))->all(),
            ];
        });
    }
}
