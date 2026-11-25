<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Operations\StoreStockAdjustmentRequest;
use App\Models\StockAdjustment;
use App\Services\StockAdjustmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockAdjustmentController extends Controller
{
    public function __construct(
        private readonly StockAdjustmentService $adjustmentService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', StockAdjustment::class);

        $query = StockAdjustment::accessibleBy($request->user())
            ->with([
                'warehouse:id,code,name',
                'creator:id,name,employee_code',
                'approver:id,name,employee_code',
                'items.product:id,sku,name,unit_of_measure',
            ])
            ->withCount('items');

        if ($warehouseId = $request->query('warehouse_id')) {
            $this->authorizeWarehouse($request->user(), (int) $warehouseId);
            $query->where('warehouse_id', (int) $warehouseId);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($reason = $request->query('reason')) {
            $query->where('reason', $reason);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where('adjustment_number', 'like', "%{$search}%");
        }

        $paginator = $query->orderByDesc('adjustment_date')
            ->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Stock adjustments retrieved.');
    }

    public function store(StoreStockAdjustmentRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $this->authorizeWarehouse($request->user(), (int) $validated['warehouse_id']);

        $adjustment = $this->adjustmentService->create($validated, $request->user());

        return $this->success($adjustment, 'Stock adjustment recorded successfully.', 201);
    }

    public function show(StockAdjustment $stockAdjustment): JsonResponse
    {
        $this->authorize('view', $stockAdjustment);

        return $this->success($this->adjustmentService->loadRelations($stockAdjustment), 'Stock adjustment details retrieved.');
    }

    public function approve(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $this->authorize('approve', $stockAdjustment);

        $approved = $this->adjustmentService->approve($stockAdjustment, $request->user());

        return $this->success($approved, 'Stock adjustment approved and applied to inventory.');
    }

    public function reject(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $this->authorize('approve', $stockAdjustment);

        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $rejected = $this->adjustmentService->reject($stockAdjustment, $validated['rejection_reason'], $request->user());

        return $this->success($rejected, 'Stock adjustment rejected.');
    }
}
