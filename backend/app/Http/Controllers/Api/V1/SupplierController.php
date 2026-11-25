<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Supplier::withCount('purchaseOrders')
            ->withSum([
                'purchaseOrders as total_purchased_amount' => fn ($q) => $q->whereIn('status', ['approved', 'partially_received', 'completed']),
            ], 'total_amount');

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%")
                    ->orWhere('contact_person', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        if ($request->boolean('all')) {
            return $this->success($query->orderBy('company_name')->get(), 'Suppliers retrieved.');
        }

        $paginator = $query->orderBy('company_name')
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Suppliers retrieved.');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:40', Rule::unique('suppliers', 'code')],
            'company_name' => ['required', 'string', 'max:180'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:1000'],
            'city' => ['nullable', 'string', 'max:100'],
            'tax_id' => ['nullable', 'string', 'max:60'],
            'payment_terms' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $supplier = Supplier::create([
            'code' => strtoupper(trim($validated['code'])),
            'company_name' => trim($validated['company_name']),
            'contact_person' => $validated['contact_person'] ?? null,
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'tax_id' => $validated['tax_id'] ?? null,
            'payment_terms' => $validated['payment_terms'] ?? 'Net 30',
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->audit->log('suppliers', 'created', "Created supplier {$supplier->code} — {$supplier->company_name}.", $supplier);

        return $this->success($supplier, 'Supplier created successfully.', 201);
    }

    public function show(Request $request, Supplier $supplier): JsonResponse
    {
        $accessibleWarehouseIds = $request->user()->accessibleWarehouseIds();

        $supplier->load([
            'purchaseOrders' => fn ($q) => $q->whereIn('warehouse_id', $accessibleWarehouseIds)
                ->with('warehouse:id,code,name')
                ->orderByDesc('id')
                ->limit(25),
            'goodsReceipts' => fn ($q) => $q->whereIn('warehouse_id', $accessibleWarehouseIds)
                ->with(['warehouse:id,code,name', 'purchaseOrder:id,po_number', 'receiver:id,name'])
                ->orderByDesc('id')
                ->limit(25),
        ]);

        return $this->success($supplier, 'Supplier profile and transaction history retrieved.');
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['sometimes', 'required', 'string', 'max:40', Rule::unique('suppliers', 'code')->ignore($supplier->id)],
            'company_name' => ['sometimes', 'required', 'string', 'max:180'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:1000'],
            'city' => ['nullable', 'string', 'max:100'],
            'tax_id' => ['nullable', 'string', 'max:60'],
            'payment_terms' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['code'])) {
            $validated['code'] = strtoupper(trim($validated['code']));
        }

        $supplier->update($validated);
        $this->audit->log('suppliers', 'updated', "Updated supplier {$supplier->code}.", $supplier);

        return $this->success($supplier->fresh(), 'Supplier updated successfully.');
    }

    public function destroy(Supplier $supplier): JsonResponse
    {
        if ($supplier->purchaseOrders()->whereIn('status', ['draft', 'approved', 'partially_received'])->exists()) {
            throw new DomainRuleException('Cannot archive a supplier with open purchase orders.');
        }

        $code = $supplier->code;
        $supplier->update(['is_active' => false]);
        $supplier->delete();
        $this->audit->log('suppliers', 'archived', "Archived supplier {$code}.");

        return $this->success(null, 'Supplier archived successfully.');
    }
}
