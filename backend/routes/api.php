<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\PurchaseOrderController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SettingController;
use App\Http\Controllers\Api\V1\StockAdjustmentController;
use App\Http\Controllers\Api\V1\StockTransferController;
use App\Http\Controllers\Api\V1\SupplierController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WarehouseController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Health probe
    Route::get('/health', fn () => response()->json([
        'success' => true,
        'message' => 'Strata WMS API v1 operational.',
        'data' => ['status' => 'healthy', 'timestamp' => now()->toISOString()],
    ]));

    // Authentication
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');

    // Protected Enterprise Endpoints
    Route::middleware(['auth:sanctum', 'active.user', 'idempotent'])->group(function () {
        // Session & Profile
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index'])
            ->middleware('permission:dashboard.view');

        // Categories
        Route::get('/categories', [CategoryController::class, 'index'])
            ->middleware('permission:categories.view,products.view');
        Route::post('/categories', [CategoryController::class, 'store'])
            ->middleware('permission:categories.manage');
        Route::put('/categories/{category}', [CategoryController::class, 'update'])
            ->middleware('permission:categories.manage');
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])
            ->middleware('permission:categories.manage');

        // Products (POST /products/{product} also accepted for multipart image update)
        Route::get('/products', [ProductController::class, 'index']);
        Route::post('/products', [ProductController::class, 'store']);
        Route::get('/products/{product}', [ProductController::class, 'show']);
        Route::put('/products/{product}', [ProductController::class, 'update']);
        Route::post('/products/{product}', [ProductController::class, 'update']);
        Route::delete('/products/{product}', [ProductController::class, 'destroy']);

        // Warehouses & Bin Locations
        Route::get('/warehouses', [WarehouseController::class, 'index']);
        Route::post('/warehouses', [WarehouseController::class, 'store']);
        Route::get('/warehouses/{warehouse}', [WarehouseController::class, 'show']);
        Route::put('/warehouses/{warehouse}', [WarehouseController::class, 'update']);
        Route::post('/warehouses/{warehouse}/locations', [WarehouseController::class, 'storeLocation']);
        Route::put('/warehouses/{warehouse}/locations/{location}', [WarehouseController::class, 'updateLocation']);

        // Inventory Balances, Stock In, Stock Out, Movements Ledger
        Route::get('/inventory', [InventoryController::class, 'index'])
            ->middleware('permission:inventory.view');
        Route::get('/inventory/movements', [InventoryController::class, 'movements'])
            ->middleware('permission:inventory.view');
        Route::get('/inventory/receipts', [InventoryController::class, 'receipts'])
            ->middleware('permission:inventory.view');
        Route::post('/inventory/stock-in', [InventoryController::class, 'stockIn'])
            ->middleware('permission:inventory.stock_in');
        Route::post('/inventory/stock-out', [InventoryController::class, 'stockOut'])
            ->middleware('permission:inventory.stock_out');

        // Suppliers
        Route::get('/suppliers', [SupplierController::class, 'index'])
            ->middleware('permission:suppliers.view');
        Route::post('/suppliers', [SupplierController::class, 'store'])
            ->middleware('permission:suppliers.create');
        Route::get('/suppliers/{supplier}', [SupplierController::class, 'show'])
            ->middleware('permission:suppliers.view');
        Route::put('/suppliers/{supplier}', [SupplierController::class, 'update'])
            ->middleware('permission:suppliers.update');
        Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy'])
            ->middleware('permission:suppliers.update');

        // Purchase Orders & Goods Receiving
        Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
        Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
        Route::get('/purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'show']);
        Route::put('/purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'update']);
        Route::post('/purchase-orders/{purchaseOrder}/approve', [PurchaseOrderController::class, 'approve']);
        Route::post('/purchase-orders/{purchaseOrder}/cancel', [PurchaseOrderController::class, 'cancel']);
        Route::post('/purchase-orders/{purchaseOrder}/receive', [PurchaseOrderController::class, 'receive']);

        // Inter-Warehouse Stock Transfers
        Route::get('/stock-transfers', [StockTransferController::class, 'index']);
        Route::post('/stock-transfers', [StockTransferController::class, 'store']);
        Route::get('/stock-transfers/{stockTransfer}', [StockTransferController::class, 'show']);
        Route::post('/stock-transfers/{stockTransfer}/approve', [StockTransferController::class, 'approve']);
        Route::post('/stock-transfers/{stockTransfer}/complete', [StockTransferController::class, 'complete']);
        Route::post('/stock-transfers/{stockTransfer}/cancel', [StockTransferController::class, 'cancel']);

        // Stock Adjustments
        Route::get('/stock-adjustments', [StockAdjustmentController::class, 'index']);
        Route::post('/stock-adjustments', [StockAdjustmentController::class, 'store']);
        Route::get('/stock-adjustments/{stockAdjustment}', [StockAdjustmentController::class, 'show']);
        Route::post('/stock-adjustments/{stockAdjustment}/approve', [StockAdjustmentController::class, 'approve']);
        Route::post('/stock-adjustments/{stockAdjustment}/reject', [StockAdjustmentController::class, 'reject']);

        // Analytics & Reports
        Route::get('/reports/inventory', [ReportController::class, 'inventory'])
            ->middleware('permission:reports.inventory');
        Route::get('/reports/inventory/export', [ReportController::class, 'inventoryCsv'])
            ->middleware('permission:reports.export');
        Route::get('/reports/transactions', [ReportController::class, 'transactions'])
            ->middleware('permission:reports.transactions');
        Route::get('/reports/transactions/export', [ReportController::class, 'transactionsCsv'])
            ->middleware('permission:reports.export');

        // Administration: Users, Roles & Permissions, System Settings
        Route::get('/admin/users', [UserController::class, 'index'])
            ->middleware('permission:users.manage');
        Route::post('/admin/users', [UserController::class, 'store'])
            ->middleware('permission:users.manage');
        Route::get('/admin/users/{user}', [UserController::class, 'show'])
            ->middleware('permission:users.manage');
        Route::put('/admin/users/{user}', [UserController::class, 'update'])
            ->middleware('permission:users.manage');

        Route::get('/admin/roles', [RoleController::class, 'index'])
            ->middleware('permission:roles.manage,users.manage');
        Route::get('/admin/permissions', [RoleController::class, 'permissions'])
            ->middleware('permission:roles.manage');
        Route::post('/admin/roles', [RoleController::class, 'store'])
            ->middleware('permission:roles.manage');
        Route::put('/admin/roles/{role}', [RoleController::class, 'update'])
            ->middleware('permission:roles.manage');

        Route::get('/admin/settings', [SettingController::class, 'index'])
            ->middleware('permission:settings.manage,dashboard.view');
        Route::put('/admin/settings', [SettingController::class, 'update'])
            ->middleware('permission:settings.manage');
        Route::get('/admin/activity-logs', [SettingController::class, 'activityLogs'])
            ->middleware('permission:settings.manage');
    });
});
