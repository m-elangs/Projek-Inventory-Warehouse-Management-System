<?php

namespace App\Http\Requests\Operations;

use Illuminate\Foundation\Http\FormRequest;

class ReceivePurchaseOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('purchase_orders.receive');
    }

    public function rules(): array
    {
        return [
            'receipt_date' => ['required', 'date'],
            'supplier_delivery_note' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_order_item_id' => ['required', 'integer', 'exists:purchase_order_items,id'],
            'items.*.warehouse_location_id' => ['nullable', 'integer', 'exists:warehouse_locations,id'],
            'items.*.quantity_received' => ['required', 'integer', 'min:0', 'max:1000000'],
            'items.*.notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
