<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Catalog\StoreProductRequest;
use App\Http\Requests\Catalog\UpdateProductRequest;
use App\Models\Product;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProductController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Product::class);

        $accessibleWarehouseIds = $request->user()->accessibleWarehouseIds();

        $query = Product::with('category:id,code,name');

        if (!empty($accessibleWarehouseIds)) {
            $query->withSum([
                'stocks as total_on_hand' => fn ($q) => $q->whereIn('warehouse_id', $accessibleWarehouseIds),
            ], 'quantity_on_hand')->withSum([
                'stocks as total_reserved' => fn ($q) => $q->whereIn('warehouse_id', $accessibleWarehouseIds),
            ], 'reserved_quantity');
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('sku', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        if ($categoryId = $request->query('category_id')) {
            $query->where('category_id', (int) $categoryId);
        }

        if ($request->has('is_active') && $request->query('is_active') !== '') {
            $query->where('is_active', filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->boolean('all')) {
            $items = $query->orderBy('name')->limit(500)->get()->map(fn (Product $p) => $this->transformProduct($p));
            return $this->success($items, 'Products list retrieved.');
        }

        $sortBy = $this->safeSortColumn(
            $request->query('sort_by'),
            ['sku', 'name', 'unit_cost', 'selling_price', 'min_stock_level', 'created_at'],
            'created_at'
        );
        $sortDir = $this->safeSortDirection($request->query('sort_dir'), 'desc');

        $paginator = $query->orderBy($sortBy, $sortDir)
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Products retrieved.', fn (Product $p) => $this->transformProduct($p));
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('products', 'public');
        }

        $product = Product::create([
            'category_id' => $validated['category_id'],
            'sku' => strtoupper(trim($validated['sku'])),
            'barcode' => !empty($validated['barcode']) ? trim($validated['barcode']) : null,
            'name' => trim($validated['name']),
            'description' => $validated['description'] ?? null,
            'unit_of_measure' => $validated['unit_of_measure'],
            'unit_cost' => $validated['unit_cost'],
            'selling_price' => $validated['selling_price'] ?? 0,
            'min_stock_level' => $validated['min_stock_level'],
            'reorder_quantity' => $validated['reorder_quantity'] ?? 0,
            'image_path' => $imagePath,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->audit->log('products', 'created', "Created product {$product->sku} — {$product->name}.", $product);

        return $this->success($this->transformProduct($product->load('category:id,code,name')), 'Product created successfully.', 201);
    }

    public function show(Request $request, Product $product): JsonResponse
    {
        $this->authorize('view', $product);

        $accessibleWarehouseIds = $request->user()->accessibleWarehouseIds();

        $product->load([
            'category:id,code,name',
            'stocks' => fn ($q) => $q->whereIn('warehouse_id', $accessibleWarehouseIds)
                ->with(['warehouse:id,code,name', 'location:id,code,name']),
        ]);

        $recentMovements = $product->movements()
            ->whereIn('warehouse_id', $accessibleWarehouseIds)
            ->with(['warehouse:id,code,name', 'performer:id,name'])
            ->orderByDesc('occurred_at')
            ->limit(15)
            ->get();

        $payload = $this->transformProduct($product);
        $payload['stocks'] = $product->stocks;
        $payload['recent_movements'] = $recentMovements;

        return $this->success($payload, 'Product details retrieved.');
    }

    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        $validated = $request->validated();

        if (isset($validated['sku'])) {
            $validated['sku'] = strtoupper(trim($validated['sku']));
        }

        if ($request->hasFile('image')) {
            if ($product->image_path) {
                Storage::disk('public')->delete($product->image_path);
            }
            $validated['image_path'] = $request->file('image')->store('products', 'public');
        }
        unset($validated['image']);

        $product->update($validated);

        $this->audit->log('products', 'updated', "Updated product {$product->sku}.", $product);

        return $this->success($this->transformProduct($product->fresh('category:id,code,name')), 'Product updated successfully.');
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->authorize('delete', $product);

        $onHand = (int) DB::table('inventory_stocks')
            ->where('product_id', $product->id)
            ->sum('quantity_on_hand');

        if ($onHand > 0) {
            throw new DomainRuleException(
                "Cannot archive {$product->sku} while {$onHand} units remain in inventory. Transfer or adjust stock to zero first."
            );
        }

        $sku = $product->sku;
        $product->update(['is_active' => false]);
        $product->delete();

        $this->audit->log('products', 'archived', "Archived product {$sku}.", $product);

        return $this->success(null, "Product {$sku} archived successfully.");
    }

    private function transformProduct(Product $product): array
    {
        $onHand = (int) ($product->total_on_hand ?? $product->stocks?->sum('quantity_on_hand') ?? 0);
        $reserved = (int) ($product->total_reserved ?? $product->stocks?->sum('reserved_quantity') ?? 0);
        $available = max(0, $onHand - $reserved);

        return [
            'id' => $product->id,
            'category_id' => $product->category_id,
            'category' => $product->category,
            'sku' => $product->sku,
            'barcode' => $product->barcode,
            'name' => $product->name,
            'description' => $product->description,
            'unit_of_measure' => $product->unit_of_measure,
            'unit_cost' => (float) $product->unit_cost,
            'selling_price' => (float) $product->selling_price,
            'min_stock_level' => (int) $product->min_stock_level,
            'reorder_quantity' => (int) $product->reorder_quantity,
            'image_url' => $product->image_path ? Storage::disk('public')->url($product->image_path) : null,
            'is_active' => (bool) $product->is_active,
            'total_on_hand' => $onHand,
            'total_reserved' => $reserved,
            'available_quantity' => $available,
            'is_low_stock' => $product->min_stock_level > 0 && $available <= $product->min_stock_level,
            'created_at' => $product->created_at?->toISOString(),
            'updated_at' => $product->updated_at?->toISOString(),
        ];
    }
}
