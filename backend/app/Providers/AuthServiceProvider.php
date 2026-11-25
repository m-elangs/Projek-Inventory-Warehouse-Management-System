<?php

namespace App\Providers;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\StockAdjustment;
use App\Models\StockTransfer;
use App\Models\User;
use App\Models\Warehouse;
use App\Policies\ProductPolicy;
use App\Policies\PurchaseOrderPolicy;
use App\Policies\StockAdjustmentPolicy;
use App\Policies\StockTransferPolicy;
use App\Policies\WarehousePolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Product::class => ProductPolicy::class,
        Warehouse::class => WarehousePolicy::class,
        PurchaseOrder::class => PurchaseOrderPolicy::class,
        StockTransfer::class => StockTransferPolicy::class,
        StockAdjustment::class => StockAdjustmentPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();

        Gate::before(function (User $user, string $ability) {
            if ($user->is_active && $user->isAdmin()) {
                return true;
            }
            return null;
        });
    }
}
