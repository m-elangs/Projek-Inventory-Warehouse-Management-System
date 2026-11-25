<?php

namespace App\Policies;

use App\Models\StockAdjustment;
use App\Models\User;

class StockAdjustmentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('adjustments.view');
    }

    public function view(User $user, StockAdjustment $adjustment): bool
    {
        return $user->hasPermission('adjustments.view')
            && $user->canAccessWarehouse($adjustment->warehouse_id);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('adjustments.create');
    }

    public function approve(User $user, StockAdjustment $adjustment): bool
    {
        return $user->hasPermission('adjustments.approve')
            && $user->canAccessWarehouse($adjustment->warehouse_id);
    }
}
