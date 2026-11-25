<?php

namespace App\Http\Requests\Catalog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('products.create');
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'sku' => ['required', 'string', 'max:60', Rule::unique('products', 'sku')],
            'barcode' => ['nullable', 'string', 'max:80', Rule::unique('products', 'barcode')],
            'name' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:2000'],
            'unit_of_measure' => ['required', 'string', 'max:30'],
            'unit_cost' => ['required', 'numeric', 'min:0', 'max:999999999.99'],
            'selling_price' => ['nullable', 'numeric', 'min:0', 'max:999999999.99'],
            'min_stock_level' => ['required', 'integer', 'min:0', 'max:10000000'],
            'reorder_quantity' => ['nullable', 'integer', 'min:0', 'max:10000000'],
            'is_active' => ['sometimes', 'boolean'],
            'image' => ['nullable', 'image', 'max:2048'],
        ];
    }
}
