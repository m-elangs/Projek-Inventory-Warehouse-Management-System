<?php

namespace App\Policies;

use App\Models\PurchaseOrder;
use App\Models\User;

class PurchaseOrderPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('purchase_orders.view');
    }

    public function view(User $user, PurchaseOrder $po): bool
    {
        return $user->hasPermission('purchase_orders.view') && $user->canAccessWarehouse($po->warehouse_id);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('purchase_orders.create');
    }

    public function update(User $user, PurchaseOrder $po): bool
    {
        return $user->hasPermission('purchase_orders.create') && $user->canAccessWarehouse($po->warehouse_id);
    }

    public function approve(User $user, PurchaseOrder $po): bool
    {
        return $user->hasPermission('purchase_orders.approve') && $user->canAccessWarehouse($po->warehouse_id);
    }

    public function receive(User $user, PurchaseOrder $po): bool
    {
        return $user->hasPermission('purchase_orders.receive') && $user->canAccessWarehouse($po->warehouse_id);
    }

    public function cancel(User $user, PurchaseOrder $po): bool
    {
        return $user->hasPermission('purchase_orders.cancel') && $user->canAccessWarehouse($po->warehouse_id);
    }
}
