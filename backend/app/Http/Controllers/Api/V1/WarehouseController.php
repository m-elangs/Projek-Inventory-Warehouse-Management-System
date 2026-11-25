<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Models\WarehouseLocation;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WarehouseController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Warehouse::class);

        $query = Warehouse::accessibleBy($request->user())
            ->with(['manager:id,name,email,employee_code', 'locations' => fn ($q) => $q->orderBy('code')])
            ->withCount('locations')
            ->withSum('stocks as total_units', 'quantity_on_hand');

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%");
            });
        }

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        $warehouses = $query->orderBy('code')->get()->map(function (Warehouse $w) {
            $valuation = (float) DB::table('inventory_stocks as s')
                ->join('products as p', 'p.id', '=', 's.product_id')
                ->where('s.warehouse_id', $w->id)
                ->whereNull('p.deleted_at')
                ->selectRaw('COALESCE(SUM(s.quantity_on_hand * p.unit_cost), 0) as val')
                ->value('val');

            $data = $w->toArray();
            $data['total_units'] = (int) ($w->total_units ?? 0);
            $data['total_valuation'] = round($valuation, 2);
            return $data;
        });

        return $this->success($warehouses, 'Warehouses retrieved.');
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Warehouse::class);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:30', Rule::unique('warehouses', 'code')],
            'name' => ['required', 'string', 'max:150'],
            'address' => ['required', 'string', 'max:1000'],
            'city' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $warehouse = DB::transaction(function () use ($validated) {
            $wh = Warehouse::create([
                'code' => strtoupper(trim($validated['code'])),
                'name' => trim($validated['name']),
                'address' => trim($validated['address']),
                'city' => $validated['city'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'manager_id' => $validated['manager_id'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            // Create default receiving and storage bin locations
            $wh->locations()->createMany([
                ['code' => 'RCV-01', 'name' => 'Main Receiving Dock', 'zone' => 'Inbound', 'location_type' => 'receiving'],
                ['code' => 'A-01-01', 'name' => 'Primary Rack A1', 'zone' => 'Zone A', 'location_type' => 'storage'],
            ]);

            if ($wh->manager_id) {
                $wh->users()->syncWithoutDetaching([$wh->manager_id]);
            }

            $this->audit->log('warehouses', 'created', "Created warehouse {$wh->code} — {$wh->name}.", $wh);

            return $wh->load(['manager:id,name,email,employee_code', 'locations']);
        });

        return $this->success($warehouse, 'Warehouse created successfully.', 201);
    }

    public function show(Request $request, Warehouse $warehouse): JsonResponse
    {
        $this->authorize('view', $warehouse);

        $warehouse->load([
            'manager:id,name,email,employee_code',
            'locations' => fn ($q) => $q->orderBy('code'),
            'users:id,name,email,employee_code,role_id',
            'users.role:id,name,slug',
        ]);

        $stocks = $warehouse->stocks()
            ->where('quantity_on_hand', '>', 0)
            ->with(['product:id,sku,name,unit_of_measure,unit_cost,min_stock_level', 'location:id,code,name'])
            ->orderByDesc('quantity_on_hand')
            ->get();

        $payload = $warehouse->toArray();
        $payload['stocks'] = $stocks;
        $payload['total_units'] = (int) $stocks->sum('quantity_on_hand');
        $payload['total_valuation'] = round($stocks->sum(fn ($s) => $s->quantity_on_hand * (float) ($s->product?->unit_cost ?? 0)), 2);

        return $this->success($payload, 'Warehouse details retrieved.');
    }

    public function update(Request $request, Warehouse $warehouse): JsonResponse
    {
        $this->authorize('update', $warehouse);

        $validated = $request->validate([
            'code' => ['sometimes', 'required', 'string', 'max:30', Rule::unique('warehouses', 'code')->ignore($warehouse->id)],
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'address' => ['sometimes', 'required', 'string', 'max:1000'],
            'city' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['code'])) {
            $validated['code'] = strtoupper(trim($validated['code']));
        }

        $warehouse->update($validated);
        if (!empty($validated['manager_id'])) {
            $warehouse->users()->syncWithoutDetaching([(int) $validated['manager_id']]);
        }

        $this->audit->log('warehouses', 'updated', "Updated warehouse {$warehouse->code}.", $warehouse);

        return $this->success($warehouse->fresh(['manager:id,name,email,employee_code', 'locations']), 'Warehouse updated successfully.');
    }

    public function storeLocation(Request $request, Warehouse $warehouse): JsonResponse
    {
        $this->authorize('manageLocations', $warehouse);

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('warehouse_locations', 'code')->where('warehouse_id', $warehouse->id),
            ],
            'name' => ['required', 'string', 'max:120'],
            'zone' => ['nullable', 'string', 'max:50'],
            'location_type' => ['required', Rule::in(['receiving', 'storage', 'picking', 'staging', 'returns'])],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $location = $warehouse->locations()->create([
            'code' => strtoupper(trim($validated['code'])),
            'name' => trim($validated['name']),
            'zone' => $validated['zone'] ?? null,
            'location_type' => $validated['location_type'],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->audit->log('warehouses', 'location_created', "Added location {$location->code} to {$warehouse->code}.", $location);

        return $this->success($location, 'Storage location added.', 201);
    }

    public function updateLocation(Request $request, Warehouse $warehouse, WarehouseLocation $location): JsonResponse
    {
        $this->authorize('manageLocations', $warehouse);

        if ($location->warehouse_id !== $warehouse->id) {
            throw new DomainRuleException('Location does not belong to the specified warehouse.');
        }

        $validated = $request->validate([
            'code' => [
                'sometimes',
                'required',
                'string',
                'max:50',
                Rule::unique('warehouse_locations', 'code')
                    ->where('warehouse_id', $warehouse->id)
                    ->ignore($location->id),
            ],
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'zone' => ['nullable', 'string', 'max:50'],
            'location_type' => ['sometimes', 'required', Rule::in(['receiving', 'storage', 'picking', 'staging', 'returns'])],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['code'])) {
            $validated['code'] = strtoupper(trim($validated['code']));
        }

        $location->update($validated);

        return $this->success($location->fresh(), 'Storage location updated.');
    }
}
