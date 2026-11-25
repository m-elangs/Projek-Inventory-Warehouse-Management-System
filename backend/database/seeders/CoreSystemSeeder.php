<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Database\Seeder;

class CoreSystemSeeder extends Seeder
{
    public function run(): void
    {
        $permissionsCatalog = [
            // Dashboard
            ['slug' => 'dashboard.view', 'name' => 'View Dashboard Overview', 'module' => 'dashboard'],

            // Products & Categories
            ['slug' => 'categories.view', 'name' => 'View Categories', 'module' => 'catalog'],
            ['slug' => 'categories.manage', 'name' => 'Manage Categories', 'module' => 'catalog'],
            ['slug' => 'products.view', 'name' => 'View Products', 'module' => 'catalog'],
            ['slug' => 'products.create', 'name' => 'Create Products', 'module' => 'catalog'],
            ['slug' => 'products.update', 'name' => 'Edit Products', 'module' => 'catalog'],
            ['slug' => 'products.archive', 'name' => 'Archive Products', 'module' => 'catalog'],

            // Warehouses
            ['slug' => 'warehouses.view', 'name' => 'View Assigned Warehouses', 'module' => 'warehouses'],
            ['slug' => 'warehouses.create', 'name' => 'Create Warehouses', 'module' => 'warehouses'],
            ['slug' => 'warehouses.update', 'name' => 'Update Warehouses', 'module' => 'warehouses'],
            ['slug' => 'warehouses.manage_locations', 'name' => 'Manage Storage Locations', 'module' => 'warehouses'],

            // Inventory Ledger
            ['slug' => 'inventory.view', 'name' => 'View Inventory & Movements', 'module' => 'inventory'],
            ['slug' => 'inventory.stock_in', 'name' => 'Record Direct Stock In', 'module' => 'inventory'],
            ['slug' => 'inventory.stock_out', 'name' => 'Record Stock Out', 'module' => 'inventory'],

            // Stock Transfers
            ['slug' => 'transfers.view', 'name' => 'View Stock Transfers', 'module' => 'transfers'],
            ['slug' => 'transfers.create', 'name' => 'Request Stock Transfers', 'module' => 'transfers'],
            ['slug' => 'transfers.approve', 'name' => 'Approve Stock Transfers', 'module' => 'transfers'],
            ['slug' => 'transfers.complete', 'name' => 'Complete Stock Transfers', 'module' => 'transfers'],
            ['slug' => 'transfers.cancel', 'name' => 'Cancel Stock Transfers', 'module' => 'transfers'],

            // Stock Adjustments
            ['slug' => 'adjustments.view', 'name' => 'View Stock Adjustments', 'module' => 'adjustments'],
            ['slug' => 'adjustments.create', 'name' => 'Submit Stock Adjustments', 'module' => 'adjustments'],
            ['slug' => 'adjustments.approve', 'name' => 'Approve / Reject Adjustments', 'module' => 'adjustments'],

            // Procurement & Suppliers
            ['slug' => 'suppliers.view', 'name' => 'View Suppliers', 'module' => 'procurement'],
            ['slug' => 'suppliers.create', 'name' => 'Create Suppliers', 'module' => 'procurement'],
            ['slug' => 'suppliers.update', 'name' => 'Update Suppliers', 'module' => 'procurement'],
            ['slug' => 'purchase_orders.view', 'name' => 'View Purchase Orders', 'module' => 'procurement'],
            ['slug' => 'purchase_orders.create', 'name' => 'Create & Edit Draft POs', 'module' => 'procurement'],
            ['slug' => 'purchase_orders.approve', 'name' => 'Approve Purchase Orders', 'module' => 'procurement'],
            ['slug' => 'purchase_orders.receive', 'name' => 'Receive PO Goods', 'module' => 'procurement'],
            ['slug' => 'purchase_orders.cancel', 'name' => 'Cancel Purchase Orders', 'module' => 'procurement'],

            // Reports
            ['slug' => 'reports.inventory', 'name' => 'View Inventory Valuation Reports', 'module' => 'reports'],
            ['slug' => 'reports.transactions', 'name' => 'View Transaction Audit Reports', 'module' => 'reports'],
            ['slug' => 'reports.export', 'name' => 'Export CSV Reports', 'module' => 'reports'],

            // Administration
            ['slug' => 'users.manage', 'name' => 'Manage Users & Assignments', 'module' => 'administration'],
            ['slug' => 'roles.manage', 'name' => 'Manage Roles & Permissions', 'module' => 'administration'],
            ['slug' => 'settings.manage', 'name' => 'Configure System Settings', 'module' => 'administration'],
        ];

        $permissionIdsBySlug = [];
        foreach ($permissionsCatalog as $perm) {
            $record = Permission::updateOrCreate(
                ['slug' => $perm['slug']],
                [
                    'name' => $perm['name'],
                    'module' => $perm['module'],
                    'description' => $perm['name'],
                ]
            );
            $permissionIdsBySlug[$perm['slug']] = $record->id;
        }

        // 1. Admin Role
        $adminRole = Role::updateOrCreate(
            ['slug' => 'admin'],
            [
                'name' => 'Administrator',
                'description' => 'Full unrestricted access across all warehouses, financial reports, users, and system settings.',
                'is_system' => true,
            ]
        );
        $adminRole->permissions()->sync(array_values($permissionIdsBySlug));

        // 2. Warehouse Manager Role
        $managerSlugs = [
            'dashboard.view',
            'categories.view', 'categories.manage',
            'products.view', 'products.create', 'products.update',
            'warehouses.view', 'warehouses.update', 'warehouses.manage_locations',
            'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
            'transfers.view', 'transfers.create', 'transfers.approve', 'transfers.complete', 'transfers.cancel',
            'adjustments.view', 'adjustments.create', 'adjustments.approve',
            'suppliers.view', 'suppliers.create', 'suppliers.update',
            'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.cancel',
            'reports.inventory', 'reports.transactions', 'reports.export',
        ];
        $managerRole = Role::updateOrCreate(
            ['slug' => 'warehouse_manager'],
            [
                'name' => 'Warehouse Manager',
                'description' => 'Manages assigned warehouses, approves transfers and adjustments, oversees procurement, and views warehouse reports.',
                'is_system' => true,
            ]
        );
        $managerRole->permissions()->sync(array_map(fn ($s) => $permissionIdsBySlug[$s], $managerSlugs));

        // 3. Warehouse Staff Role
        $staffSlugs = [
            'dashboard.view',
            'categories.view',
            'products.view',
            'warehouses.view',
            'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
            'transfers.view', 'transfers.create', 'transfers.complete',
            'adjustments.view', 'adjustments.create',
            'suppliers.view',
            'purchase_orders.view', 'purchase_orders.receive',
        ];
        $staffRole = Role::updateOrCreate(
            ['slug' => 'warehouse_staff'],
            [
                'name' => 'Warehouse Staff',
                'description' => 'Executes day-to-day inbound receiving, outbound stock dispatches, cycle count submissions, and assigned transfers.',
                'is_system' => true,
            ]
        );
        $staffRole->permissions()->sync(array_map(fn ($s) => $permissionIdsBySlug[$s], $staffSlugs));

        // Default System Settings
        $defaultSettings = [
            ['setting_key' => 'company_name', 'setting_group' => 'organization', 'setting_value' => 'Strata Logistics & Distribution Corp.', 'value_type' => 'string'],
            ['setting_key' => 'company_email', 'setting_group' => 'organization', 'setting_value' => 'operations@stratawms.io', 'value_type' => 'string'],
            ['setting_key' => 'currency_code', 'setting_group' => 'organization', 'setting_value' => 'IDR', 'value_type' => 'string'],
            ['setting_key' => 'po_prefix', 'setting_group' => 'documents', 'setting_value' => 'PO', 'value_type' => 'string'],
            ['setting_key' => 'transfer_prefix', 'setting_group' => 'documents', 'setting_value' => 'TRF', 'value_type' => 'string'],
            ['setting_key' => 'adjustment_prefix', 'setting_group' => 'documents', 'setting_value' => 'ADJ', 'value_type' => 'string'],
            ['setting_key' => 'receipt_prefix', 'setting_group' => 'documents', 'setting_value' => 'GRN', 'value_type' => 'string'],
            ['setting_key' => 'low_stock_threshold_default', 'setting_group' => 'inventory', 'setting_value' => '15', 'value_type' => 'integer'],
            ['setting_key' => 'require_adjustment_approval', 'setting_group' => 'inventory', 'setting_value' => '1', 'value_type' => 'boolean'],
        ];

        foreach ($defaultSettings as $setting) {
            SystemSetting::firstOrCreate(
                ['setting_key' => $setting['setting_key']],
                $setting
            );
        }

        // Bootstrap System Administrator if none exists
        $bootstrapEmail = env('ADMIN_BOOTSTRAP_EMAIL', 'admin@stratawms.io');
        $bootstrapPassword = env('ADMIN_BOOTSTRAP_PASSWORD', 'Password123!');

        User::firstOrCreate(
            ['email' => $bootstrapEmail],
            [
                'role_id' => $adminRole->id,
                'employee_code' => 'EMP-0001',
                'name' => 'Elena Vance',
                'phone' => '+1 (415) 890-2310',
                'password' => $bootstrapPassword,
                'is_active' => true,
            ]
        );
    }
}
