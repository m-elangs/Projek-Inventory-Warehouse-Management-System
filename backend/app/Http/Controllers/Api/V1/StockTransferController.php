<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Operations\StoreStockTransferRequest;
use App\Models\StockTransfer;
use App\Services\StockTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockTransferController extends Controller
{
    public function __construct(
        private readonly StockTransferService $transferService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', StockTransfer::class);

        $query = StockTransfer::accessibleBy($request->user())
            ->with([
                'sourceWarehouse:id,code,name',
                'destinationWarehouse:id,code,name',
                'requester:id,name,employee_code',
                'completer:id,name,employee_code',
                'items.product:id,sku,name,unit_of_measure',
            ])
            ->withSum('items as total_quantity', 'quantity');

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where(function ($q) use ($warehouseId) {
                $q->where('source_warehouse_id', (int) $warehouseId)
                    ->orWhere('destination_warehouse_id', (int) $warehouseId);
            });
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where('transfer_number', 'like', "%{$search}%");
        }

        $paginator = $query->orderByDesc('transfer_date')
            ->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Stock transfers retrieved.');
    }

    public function store(StoreStockTransferRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['source_warehouse_id'], 'You must have access to the source warehouse to initiate a transfer.');

        $transfer = $this->transferService->create($validated, $request->user());

        return $this->success($transfer, 'Stock transfer created successfully.', 201);
    }

    public function show(StockTransfer $stockTransfer): JsonResponse
    {
        $this->authorize('view', $stockTransfer);

        return $this->success($this->transferService->loadRelations($stockTransfer), 'Stock transfer details retrieved.');
    }

    public function approve(Request $request, StockTransfer $stockTransfer): JsonResponse
    {
        $this->authorize('approve', $stockTransfer);

        $approved = $this->transferService->approve($stockTransfer, $request->user());

        return $this->success($approved, 'Stock transfer approved.');
    }

    public function complete(Request $request, StockTransfer $stockTransfer): JsonResponse
    {
        $this->authorize('complete', $stockTransfer);

        $completed = $this->transferService->complete($stockTransfer, $request->user());

        return $this->success($completed, 'Stock transfer completed and inventory updated.');
    }

    public function cancel(Request $request, StockTransfer $stockTransfer): JsonResponse
    {
        $this->authorize('cancel', $stockTransfer);

        $cancelled = $this->transferService->cancel($stockTransfer, $request->user());

        return $this->success($cancelled, 'Stock transfer cancelled and reserved stock released.');
    }
}
