<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Operations\ReceivePurchaseOrderRequest;
use App\Http\Requests\Operations\StorePurchaseOrderRequest;
use App\Models\PurchaseOrder;
use App\Services\PurchaseOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseOrderController extends Controller
{
    public function __construct(
        private readonly PurchaseOrderService $poService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PurchaseOrder::class);

        $query = PurchaseOrder::accessibleBy($request->user())
            ->with([
                'supplier:id,code,company_name',
                'warehouse:id,code,name',
                'creator:id,name,employee_code',
            ])
            ->withCount('items')
            ->withSum('items as total_ordered_qty', 'ordered_quantity')
            ->withSum('items as total_received_qty', 'received_quantity');

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where('warehouse_id', (int) $warehouseId);
        }

        if ($supplierId = $request->query('supplier_id')) {
            $query->where('supplier_id', (int) $supplierId);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('po_number', 'like', "%{$search}%")
                    ->orWhereHas('supplier', fn ($sq) => $sq->where('company_name', 'like', "%{$search}%"));
            });
        }

        $paginator = $query->orderByDesc('order_date')
            ->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Purchase orders retrieved.');
    }

    public function store(StorePurchaseOrderRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['warehouse_id']);

        $po = $this->poService->create($validated, $request->user());

        return $this->success($po, 'Purchase order created successfully.', 201);
    }

    public function show(PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->authorize('view', $purchaseOrder);

        return $this->success($this->poService->loadRelations($purchaseOrder), 'Purchase order retrieved.');
    }

    public function update(StorePurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->authorize('update', $purchaseOrder);
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['warehouse_id']);

        $updated = $this->poService->update($purchaseOrder, $validated, $request->user());

        return $this->success($updated, 'Purchase order updated successfully.');
    }

    public function approve(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->authorize('approve', $purchaseOrder);

        $approved = $this->poService->approve($purchaseOrder, $request->user());

        return $this->success($approved, 'Purchase order approved.');
    }

    public function cancel(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->authorize('cancel', $purchaseOrder);

        $cancelled = $this->poService->cancel($purchaseOrder, $request->user());

        return $this->success($cancelled, 'Purchase order cancelled.');
    }

    public function receive(ReceivePurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->authorize('receive', $purchaseOrder);

        $receipt = $this->poService->receiveGoods($purchaseOrder, $request->validated(), $request->user());

        return $this->success($receipt, 'Goods receipt posted and stock updated.', 201);
    }
}
