<?php

namespace App\Services;

use App\Exceptions\DomainRuleException;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PurchaseOrderService
{
    public function __construct(
        private readonly InventoryLedgerService $ledger,
        private readonly DocumentNumberService $docNumber,
        private readonly ActivityAuditService $audit
    ) {}

    public function create(array $data, User $actor): PurchaseOrder
    {
        return DB::transaction(function () use ($data, $actor) {
            $prefix = (string) SystemSetting::getValue('po_prefix', 'PO');
            $poNumber = $this->docNumber->generate($prefix, 'purchase_orders', 'po_number');

            [$subtotal, $preparedItems] = $this->calculateItems($data['items']);
            $taxAmount = round((float) ($data['tax_amount'] ?? 0), 2);
            $discountAmount = round((float) ($data['discount_amount'] ?? 0), 2);
            $totalAmount = max(0, round($subtotal + $taxAmount - $discountAmount, 2));

            $requestedStatus = $data['status'] ?? 'draft';
            $status = ($requestedStatus === 'approved' && $actor->hasPermission('purchase_orders.approve'))
                ? 'approved'
                : 'draft';

            $po = PurchaseOrder::create([
                'po_number' => $poNumber,
                'supplier_id' => (int) $data['supplier_id'],
                'warehouse_id' => (int) $data['warehouse_id'],
                'order_date' => $data['order_date'],
                'expected_delivery_date' => $data['expected_delivery_date'] ?? null,
                'status' => $status,
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => $discountAmount,
                'total_amount' => $totalAmount,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor->id,
                'approved_by' => $status === 'approved' ? $actor->id : null,
                'approved_at' => $status === 'approved' ? now() : null,
            ]);

            foreach ($preparedItems as $item) {
                $po->items()->create($item);
            }

            $this->audit->log(
                'purchase_orders',
                'created',
                "Created Purchase Order {$po->po_number} ({$po->status}).",
                $po,
                ['total_amount' => $totalAmount, 'items_count' => count($preparedItems)],
                $actor
            );

            return $this->loadRelations($po);
        });
    }

    public function update(PurchaseOrder $po, array $data, User $actor): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $data, $actor) {
            $locked = PurchaseOrder::whereKey($po->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'draft') {
                throw new DomainRuleException("Only draft purchase orders can be edited. Current status: {$locked->status}.");
            }

            [$subtotal, $preparedItems] = $this->calculateItems($data['items']);
            $taxAmount = round((float) ($data['tax_amount'] ?? $locked->tax_amount), 2);
            $discountAmount = round((float) ($data['discount_amount'] ?? $locked->discount_amount), 2);
            $totalAmount = max(0, round($subtotal + $taxAmount - $discountAmount, 2));

            $locked->update([
                'supplier_id' => (int) ($data['supplier_id'] ?? $locked->supplier_id),
                'warehouse_id' => (int) ($data['warehouse_id'] ?? $locked->warehouse_id),
                'order_date' => $data['order_date'] ?? $locked->order_date,
                'expected_delivery_date' => array_key_exists('expected_delivery_date', $data)
                    ? $data['expected_delivery_date']
                    : $locked->expected_delivery_date,
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => $discountAmount,
                'total_amount' => $totalAmount,
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $locked->notes,
            ]);

            $locked->items()->delete();
            foreach ($preparedItems as $item) {
                $locked->items()->create($item);
            }

            $this->audit->log('purchase_orders', 'updated', "Updated draft Purchase Order {$locked->po_number}.", $locked, [], $actor);

            return $this->loadRelations($locked);
        });
    }

    public function approve(PurchaseOrder $po, User $actor): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $actor) {
            $locked = PurchaseOrder::whereKey($po->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'draft') {
                throw new DomainRuleException("Purchase Order {$locked->po_number} cannot be approved from status '{$locked->status}'.", [], 409);
            }

            $locked->update([
                'status' => 'approved',
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            $this->audit->log('purchase_orders', 'approved', "Approved Purchase Order {$locked->po_number}.", $locked, [], $actor);

            return $this->loadRelations($locked);
        });
    }

    public function cancel(PurchaseOrder $po, User $actor): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $actor) {
            $locked = PurchaseOrder::with('items')->whereKey($po->id)->lockForUpdate()->firstOrFail();

            if (!in_array($locked->status, ['draft', 'approved'], true)) {
                throw new DomainRuleException("Purchase Order {$locked->po_number} cannot be cancelled in '{$locked->status}' status.", [], 409);
            }

            $totalReceived = $locked->items->sum('received_quantity');
            if ($totalReceived > 0) {
                throw new DomainRuleException("Cannot cancel Purchase Order {$locked->po_number} because goods have already been received against it.", [], 409);
            }

            $locked->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
            ]);

            $this->audit->log('purchase_orders', 'cancelled', "Cancelled Purchase Order {$locked->po_number}.", $locked, [], $actor);

            return $this->loadRelations($locked);
        });
    }

    public function receiveGoods(PurchaseOrder $po, array $data, User $actor): GoodsReceipt
    {
        return DB::transaction(function () use ($po, $data, $actor) {
            $lockedPo = PurchaseOrder::whereKey($po->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedPo->status, ['approved', 'partially_received'], true)) {
                throw new DomainRuleException(
                    "Purchase Order {$lockedPo->po_number} must be approved before receiving goods (current status: {$lockedPo->status}).",
                    [],
                    409
                );
            }

            $lockedItems = PurchaseOrderItem::where('purchase_order_id', $lockedPo->id)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $prefix = (string) SystemSetting::getValue('receipt_prefix', 'GRN');
            $receiptNumber = $this->docNumber->generate($prefix, 'goods_receipts', 'receipt_number');
            $receiptDate = !empty($data['receipt_date']) ? Carbon::parse($data['receipt_date']) : now();

            $receipt = GoodsReceipt::create([
                'receipt_number' => $receiptNumber,
                'receipt_type' => 'purchase_order',
                'purchase_order_id' => $lockedPo->id,
                'supplier_id' => $lockedPo->supplier_id,
                'warehouse_id' => $lockedPo->warehouse_id,
                'receipt_date' => $receiptDate->toDateString(),
                'supplier_delivery_note' => $data['supplier_delivery_note'] ?? null,
                'status' => 'completed',
                'notes' => $data['notes'] ?? null,
                'received_by' => $actor->id,
            ]);

            $ledgerEntries = [];
            foreach ($data['items'] as $idx => $incoming) {
                $qtyReceived = (int) ($incoming['quantity_received'] ?? 0);
                if ($qtyReceived <= 0) {
                    continue;
                }

                $poItemId = (int) $incoming['purchase_order_item_id'];
                /** @var PurchaseOrderItem|null $poItem */
                $poItem = $lockedItems->get($poItemId);

                if (!$poItem) {
                    throw new DomainRuleException("Line item #{$poItemId} does not belong to Purchase Order {$lockedPo->po_number}.", [
                        "items.{$idx}.purchase_order_item_id" => ['Invalid purchase order item.'],
                    ]);
                }

                $remaining = max(0, (int) $poItem->ordered_quantity - (int) $poItem->received_quantity);
                if ($qtyReceived > $remaining) {
                    $product = Product::find($poItem->product_id);
                    $sku = $product?->sku ?? "#{$poItem->product_id}";
                    throw new DomainRuleException(
                        "Cannot receive {$qtyReceived} units of {$sku}; only {$remaining} units remain open on {$lockedPo->po_number}.",
                        [
                            "items.{$idx}.quantity_received" => [
                                "Exceeds remaining receivable quantity ({$remaining} units).",
                            ],
                        ]
                    );
                }

                $locationId = !empty($incoming['warehouse_location_id']) ? (int) $incoming['warehouse_location_id'] : null;

                $poItem->received_quantity = (int) $poItem->received_quantity + $qtyReceived;
                $poItem->save();

                GoodsReceiptItem::create([
                    'goods_receipt_id' => $receipt->id,
                    'purchase_order_item_id' => $poItem->id,
                    'product_id' => $poItem->product_id,
                    'warehouse_location_id' => $locationId,
                    'quantity_received' => $qtyReceived,
                    'unit_cost' => (float) $poItem->unit_price,
                    'notes' => $incoming['notes'] ?? null,
                ]);

                // Update product latest unit_cost if positive
                if ((float) $poItem->unit_price > 0) {
                    Product::whereKey($poItem->product_id)->update([
                        'unit_cost' => $poItem->unit_price,
                    ]);
                }

                $ledgerEntries[] = [
                    'warehouse_id' => $lockedPo->warehouse_id,
                    'warehouse_location_id' => $locationId,
                    'product_id' => $poItem->product_id,
                    'movement_type' => 'purchase_receipt',
                    'quantity_change' => $qtyReceived,
                    'unit_cost' => (float) $poItem->unit_price,
                    'reference_type' => 'purchase_order',
                    'reference_id' => $lockedPo->id,
                    'reference_number' => $lockedPo->po_number,
                    'notes' => "Received via {$receipt->receipt_number}",
                    'occurred_at' => $receiptDate->isToday() ? now() : $receiptDate->copy()->setTimeFrom(now()),
                ];
            }

            if (empty($ledgerEntries)) {
                throw new DomainRuleException('At least one line item must have a received quantity greater than zero.', [
                    'items' => ['Enter a received quantity greater than zero for at least one product.'],
                ]);
            }

            $this->ledger->applyMovements($ledgerEntries, $actor);

            // Recompute PO receiving completion status
            $allCompleted = $lockedItems->every(fn (PurchaseOrderItem $item) => (int) $item->received_quantity >= (int) $item->ordered_quantity);
            $lockedPo->status = $allCompleted ? 'completed' : 'partially_received';
            $lockedPo->save();

            $this->audit->log(
                'purchase_orders',
                'received_goods',
                "Posted Goods Receipt {$receipt->receipt_number} against {$lockedPo->po_number} (PO status: {$lockedPo->status}).",
                $lockedPo,
                ['receipt_id' => $receipt->id, 'receipt_number' => $receipt->receipt_number],
                $actor
            );

            return $receipt->load([
                'purchaseOrder:id,po_number,status',
                'supplier:id,code,company_name',
                'warehouse:id,code,name',
                'receiver:id,name',
                'items.product:id,sku,name,unit_of_measure',
                'items.location:id,code,name',
            ]);
        });
    }

    /**
     * @return array{0: float, 1: array<int, array<string, mixed>>}
     */
    private function calculateItems(array $rawItems): array
    {
        $seenProducts = [];
        $subtotal = '0.00';
        $prepared = [];

        foreach ($rawItems as $idx => $item) {
            $productId = (int) $item['product_id'];
            if (isset($seenProducts[$productId])) {
                throw new DomainRuleException('Duplicate product line items are not allowed in the same Purchase Order.', [
                    "items.{$idx}.product_id" => ['Consolidate duplicate products into a single line item.'],
                ]);
            }
            $seenProducts[$productId] = true;

            $qty = (int) $item['ordered_quantity'];
            $unitPrice = number_format((float) $item['unit_price'], 2, '.', '');
            $lineTotal = bcmul((string) $qty, $unitPrice, 2);
            $subtotal = bcadd($subtotal, $lineTotal, 2);

            $prepared[] = [
                'product_id' => $productId,
                'ordered_quantity' => $qty,
                'received_quantity' => 0,
                'unit_price' => (float) $unitPrice,
                'line_total' => (float) $lineTotal,
            ];
        }

        return [(float) $subtotal, $prepared];
    }

    public function loadRelations(PurchaseOrder $po): PurchaseOrder
    {
        return $po->fresh([
            'supplier:id,code,company_name,contact_person,email,phone',
            'warehouse:id,code,name',
            'creator:id,name,employee_code',
            'approver:id,name,employee_code',
            'items.product:id,sku,name,unit_of_measure,unit_cost',
            'receipts.receiver:id,name',
            'receipts.items.product:id,sku,name,unit_of_measure',
        ]);
    }
}
