<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Warehouse;

class WarehousePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('warehouses.view');
    }

    public function view(User $user, Warehouse $warehouse): bool
    {
        return $user->hasPermission('warehouses.view') && $user->canAccessWarehouse($warehouse->id);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('warehouses.create');
    }

    public function update(User $user, Warehouse $warehouse): bool
    {
        return $user->hasPermission('warehouses.update') && $user->canAccessWarehouse($warehouse->id);
    }

    public function manageLocations(User $user, Warehouse $warehouse): bool
    {
        return $user->hasPermission('warehouses.manage_locations') && $user->canAccessWarehouse($warehouse->id);
    }
}
