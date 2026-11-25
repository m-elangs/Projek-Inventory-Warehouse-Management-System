<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Category::withCount('products');

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        $categories = $query->orderBy('name')->get();

        return $this->success($categories, 'Categories retrieved.');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:40', Rule::unique('categories', 'code')],
            'name' => ['required', 'string', 'max:120', Rule::unique('categories', 'name')],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $category = Category::create([
            'code' => strtoupper(trim($validated['code'])),
            'name' => trim($validated['name']),
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->audit->log('categories', 'created', "Created product category {$category->name} ({$category->code}).", $category);

        return $this->success($category->loadCount('products'), 'Category created successfully.', 201);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['sometimes', 'required', 'string', 'max:40', Rule::unique('categories', 'code')->ignore($category->id)],
            'name' => ['sometimes', 'required', 'string', 'max:120', Rule::unique('categories', 'name')->ignore($category->id)],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['code'])) {
            $validated['code'] = strtoupper(trim($validated['code']));
        }

        $category->update($validated);
        $this->audit->log('categories', 'updated', "Updated category {$category->name}.", $category);

        return $this->success($category->fresh()->loadCount('products'), 'Category updated successfully.');
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->products()->exists()) {
            throw new DomainRuleException('Cannot delete a category that still has assigned products. Reassign products first.');
        }

        $name = $category->name;
        $category->delete();
        $this->audit->log('categories', 'deleted', "Archived category {$name}.");

        return $this->success(null, 'Category archived successfully.');
    }
}
