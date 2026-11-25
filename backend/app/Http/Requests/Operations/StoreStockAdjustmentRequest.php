<?php

namespace App\Http\Requests\Operations;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStockAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('adjustments.create');
    }

    public function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'adjustment_date' => ['required', 'date'],
            'reason' => ['required', Rule::in(['cycle_count', 'damaged', 'expired', 'theft_loss', 'found_surplus', 'data_correction'])],
            'notes' => ['required', 'string', 'min:5', 'max:1000'],
            'approve_immediately' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.warehouse_location_id' => ['nullable', 'integer', 'exists:warehouse_locations,id'],
            'items.*.adjusted_quantity' => ['required', 'integer', 'min:0', 'max:10000000'],
            'items.*.notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
