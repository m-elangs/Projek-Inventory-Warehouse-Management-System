<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = [
        'movement_number',
        'warehouse_id',
        'warehouse_location_id',
        'product_id',
        'movement_type',
        'quantity_change',
        'balance_before',
        'balance_after',
        'unit_cost',
        'reference_type',
        'reference_id',
        'reference_number',
        'destination',
        'notes',
        'performed_by',
        'occurred_at',
    ];

    protected $casts = [
        'quantity_change' => 'integer',
        'balance_before' => 'integer',
        'balance_after' => 'integer',
        'unit_cost' => 'decimal:2',
        'occurred_at' => 'datetime',
        'created_at' => 'datetime',
    ];

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

    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }

    public function scopeAccessibleBy(Builder $query, User $user): Builder
    {
        if ($user->isAdmin()) {
            return $query;
        }

        $ids = $user->accessibleWarehouseIds();

        return empty($ids) ? $query->whereRaw('1 = 0') : $query->whereIn('stock_movements.warehouse_id', $ids);
    }
}
