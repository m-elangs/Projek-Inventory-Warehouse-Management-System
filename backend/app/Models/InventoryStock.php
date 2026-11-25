<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'warehouse_id',
        'warehouse_location_id',
        'product_id',
        'quantity_on_hand',
        'reserved_quantity',
        'last_movement_at',
    ];

    protected $casts = [
        'quantity_on_hand' => 'integer',
        'reserved_quantity' => 'integer',
        'last_movement_at' => 'datetime',
    ];

    protected $appends = [
        'available_quantity',
    ];

    public function getAvailableQuantityAttribute(): int
    {
        return max(0, (int) $this->quantity_on_hand - (int) $this->reserved_quantity);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(WarehouseLocation::class, 'warehouse_location_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function scopeAccessibleBy(Builder $query, User $user): Builder
    {
        if ($user->isAdmin()) {
            return $query;
        }

        $ids = $user->accessibleWarehouseIds();

        return empty($ids) ? $query->whereRaw('1 = 0') : $query->whereIn('inventory_stocks.warehouse_id', $ids);
    }
}
