<?php

namespace App\Policies;

use App\Models\StockTransfer;
use App\Models\User;

class StockTransferPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('transfers.view');
    }

    public function view(User $user, StockTransfer $transfer): bool
    {
        return $user->hasPermission('transfers.view') && (
            $user->canAccessWarehouse($transfer->source_warehouse_id)
            || $user->canAccessWarehouse($transfer->destination_warehouse_id)
        );
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('transfers.create');
    }

    public function approve(User $user, StockTransfer $transfer): bool
    {
        return $user->hasPermission('transfers.approve')
            && $user->canAccessWarehouse($transfer->source_warehouse_id);
    }

    public function complete(User $user, StockTransfer $transfer): bool
    {
        return $user->hasPermission('transfers.complete') && (
            $user->canAccessWarehouse($transfer->destination_warehouse_id)
            || $user->canAccessWarehouse($transfer->source_warehouse_id)
        );
    }

    public function cancel(User $user, StockTransfer $transfer): bool
    {
        return $user->hasPermission('transfers.cancel')
            && $user->canAccessWarehouse($transfer->source_warehouse_id);
    }
}
