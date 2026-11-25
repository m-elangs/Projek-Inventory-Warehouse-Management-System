<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PurchaseOrderService;
use App\Services\StockAdjustmentService;
use App\Services\StockOperationService;
use App\Services\StockTransferService;
use Illuminate\Database\Seeder;

class DemoDatasetSeeder extends Seeder
{
    public function run(): void
    {
        // Idempotent guard so running db:seed twice does not duplicate demo transactions
        if (Warehouse::where('code', 'WH-JKT-01')->exists()) {
            return;
        }

        $admin = User::where('email', 'admin@stratawms.io')->firstOrFail();
        $managerRole = Role::where('slug', 'warehouse_manager')->firstOrFail();
        $staffRole = Role::where('slug', 'warehouse_staff')->firstOrFail();

        // Operational Staff & Managers
        $managerJkt = User::create([
            'role_id' => $managerRole->id,
            'employee_code' => 'EMP-0102',
            'name' => 'Marcus Hendra',
            'email' => 'manager@stratawms.io',
            'phone' => '+62 812-8400-1120',
            'password' => 'Password123!',
            'is_active' => true,
        ]);

        $managerSby = User::create([
            'role_id' => $managerRole->id,
            'employee_code' => 'EMP-0103',
            'name' => 'Nadia Kusuma',
            'email' => 'nadia.manager@stratawms.io',
            'phone' => '+62 813-5520-9012',
            'password' => 'Password123!',
            'is_active' => true,
        ]);

        $staffJkt = User::create([
            'role_id' => $staffRole->id,
            'employee_code' => 'EMP-0201',
            'name' => 'Rizky Pratama',
            'email' => 'staff@stratawms.io',
            'phone' => '+62 815-7701-3349',
            'password' => 'Password123!',
            'is_active' => true,
        ]);

        $staffSby = User::create([
            'role_id' => $staffRole->id,
            'employee_code' => 'EMP-0202',
            'name' => 'Dimas Saputra',
            'email' => 'dimas.staff@stratawms.io',
            'phone' => '+62 816-2290-4418',
            'password' => 'Password123!',
            'is_active' => true,
        ]);

        // 3 Warehouses with internal storage locations
        $whJkt = Warehouse::create([
            'code' => 'WH-JKT-01',
            'name' => 'Jakarta Central Distribution Hub',
            'address' => 'Kawasan Industri Pulogadung Blok J-14, Jakarta Timur',
            'city' => 'Jakarta',
            'phone' => '+62 21-460-8820',
            'manager_id' => $managerJkt->id,
            'is_active' => true,
        ]);
        $locJktRcv = $whJkt->locations()->create(['code' => 'RCV-DOCK-1', 'name' => 'Inbound Receiving Bay 1', 'zone' => 'Inbound', 'location_type' => 'receiving']);
        $locJktA1 = $whJkt->locations()->create(['code' => 'A-01-R1', 'name' => 'High-Density Rack A1', 'zone' => 'Zone A', 'location_type' => 'storage']);
        $locJktB2 = $whJkt->locations()->create(['code' => 'B-02-P1', 'name' => 'Fast Picking Shelf B2', 'zone' => 'Zone B', 'location_type' => 'picking']);

        $whSby = Warehouse::create([
            'code' => 'WH-SBY-02',
            'name' => 'Surabaya East Fulfillment Center',
            'address' => 'Surabaya Industrial Estate Rungkut (SIER) Kav. 22',
            'city' => 'Surabaya',
            'phone' => '+62 31-843-1904',
            'manager_id' => $managerSby->id,
            'is_active' => true,
        ]);
        $whSby->locations()->create(['code' => 'RCV-EAST-1', 'name' => 'East Receiving Dock', 'zone' => 'Inbound', 'location_type' => 'receiving']);
        $locSbyS1 = $whSby->locations()->create(['code' => 'S-01-R1', 'name' => 'Main Rack S1', 'zone' => 'Zone S', 'location_type' => 'storage']);

        $whBdg = Warehouse::create([
            'code' => 'WH-BDG-03',
            'name' => 'Bandung West Regional Depot',
            'address' => 'Jl. Soekarno-Hatta No. 618, Gedebage',
            'city' => 'Bandung',
            'phone' => '+62 22-756-4410',
            'manager_id' => $managerJkt->id,
            'is_active' => true,
        ]);
        $locBdgM1 = $whBdg->locations()->create(['code' => 'M-01-01', 'name' => 'Regional Storage Bay M1', 'zone' => 'Main', 'location_type' => 'storage']);

        // Assign users to warehouses
        $managerJkt->warehouses()->sync([$whJkt->id, $whBdg->id]);
        $managerSby->warehouses()->sync([$whSby->id]);
        $staffJkt->warehouses()->sync([$whJkt->id]);
        $staffSby->warehouses()->sync([$whSby->id]);

        // Categories
        $catNet = Category::create(['code' => 'NET-INF', 'name' => 'Network Infrastructure', 'description' => 'Enterprise switches, routers, wireless access points, and transceivers.']);
        $catAidc = Category::create(['code' => 'AIDC-HW', 'name' => 'Barcode & AIDC Hardware', 'description' => 'Handheld scanners, mobile warehouse computers, and RFID readers.']);
        $catPack = Category::create(['code' => 'PACK-SUP', 'name' => 'Packaging & Labeling', 'description' => 'Thermal transfer labels, stretch wrap, and heavy-duty cartons.']);
        $catPwr = Category::create(['code' => 'PWR-UPS', 'name' => 'Power & Rack Systems', 'description' => 'Rack-mount UPS units, PDUs, and server enclosures.']);
        $catSafe = Category::create(['code' => 'MHE-SAFE', 'name' => 'Warehouse Safety & MHE', 'description' => 'Dock safety sensors, pallet scales, and protective equipment.']);

        // Products Catalog (12 realistic commercial B2B SKUs in Indonesian Rupiah)
        $productsData = [
            ['category_id' => $catNet->id, 'sku' => 'NET-SW-24P', 'barcode' => '899401000101', 'name' => 'Catalyst 24-Port PoE+ Managed Switch', 'unit_of_measure' => 'unit', 'unit_cost' => 9500000.00, 'selling_price' => 12800000.00, 'min_stock_level' => 15, 'reorder_quantity' => 30],
            ['category_id' => $catNet->id, 'sku' => 'NET-AP-6E', 'barcode' => '899401000102', 'name' => 'Enterprise Wi-Fi 6E Tri-Band Access Point', 'unit_of_measure' => 'unit', 'unit_cost' => 3650000.00, 'selling_price' => 4950000.00, 'min_stock_level' => 25, 'reorder_quantity' => 50],
            ['category_id' => $catNet->id, 'sku' => 'NET-SFP-10G', 'barcode' => '899401000103', 'name' => '10GBASE-SR SFP+ Optical Transceiver Module', 'unit_of_measure' => 'pcs', 'unit_cost' => 580000.00, 'selling_price' => 880000.00, 'min_stock_level' => 60, 'reorder_quantity' => 120],
            ['category_id' => $catAidc->id, 'sku' => 'AIDC-SCN-2D', 'barcode' => '899401000201', 'name' => 'Industrial 2D Cordless Barcode Imager', 'unit_of_measure' => 'unit', 'unit_cost' => 4650000.00, 'selling_price' => 6350000.00, 'min_stock_level' => 20, 'reorder_quantity' => 40],
            ['category_id' => $catAidc->id, 'sku' => 'AIDC-PDT-55', 'barcode' => '899401000202', 'name' => 'Rugged Android Touch Mobile Computer', 'unit_of_measure' => 'unit', 'unit_cost' => 11700000.00, 'selling_price' => 14900000.00, 'min_stock_level' => 12, 'reorder_quantity' => 20],
            ['category_id' => $catAidc->id, 'sku' => 'AIDC-PRT-4T', 'barcode' => '899401000203', 'name' => '4-Inch Industrial Thermal Barcode Printer', 'unit_of_measure' => 'unit', 'unit_cost' => 7800000.00, 'selling_price' => 10350000.00, 'min_stock_level' => 10, 'reorder_quantity' => 15],
            ['category_id' => $catPack->id, 'sku' => 'PCK-LBL-100', 'barcode' => '899401000301', 'name' => 'Thermal Shipping Labels 100x150mm (Roll of 500)', 'unit_of_measure' => 'roll', 'unit_cost' => 125000.00, 'selling_price' => 210000.00, 'min_stock_level' => 150, 'reorder_quantity' => 400],
            ['category_id' => $catPack->id, 'sku' => 'PCK-WRP-500', 'barcode' => '899401000302', 'name' => 'Heavy-Duty Machine Stretch Film 500mm', 'unit_of_measure' => 'roll', 'unit_cost' => 360000.00, 'selling_price' => 540000.00, 'min_stock_level' => 80, 'reorder_quantity' => 160],
            ['category_id' => $catPwr->id, 'sku' => 'PWR-UPS-3K', 'barcode' => '899401000401', 'name' => 'Smart-UPS 3000VA 2U Rackmount Li-Ion', 'unit_of_measure' => 'unit', 'unit_cost' => 17250000.00, 'selling_price' => 22350000.00, 'min_stock_level' => 8, 'reorder_quantity' => 12],
            ['category_id' => $catPwr->id, 'sku' => 'PWR-PDU-16A', 'barcode' => '899401000402', 'name' => 'Metered 1U Zero-U Rack PDU 16A 12-Outlet', 'unit_of_measure' => 'unit', 'unit_cost' => 2750000.00, 'selling_price' => 3800000.00, 'min_stock_level' => 18, 'reorder_quantity' => 30],
            ['category_id' => $catSafe->id, 'sku' => 'SAF-LSR-DCK', 'barcode' => '899401000501', 'name' => 'Laser Loading Dock Alignment Sensor Kit', 'unit_of_measure' => 'set', 'unit_cost' => 6150000.00, 'selling_price' => 8400000.00, 'min_stock_level' => 10, 'reorder_quantity' => 16],
            ['category_id' => $catSafe->id, 'sku' => 'SAF-SCL-2T', 'barcode' => '899401000502', 'name' => 'Digital Floor Pallet Scale 2000kg Capacity', 'unit_of_measure' => 'unit', 'unit_cost' => 13350000.00, 'selling_price' => 17700000.00, 'min_stock_level' => 5, 'reorder_quantity' => 8],
        ];

        $products = [];
        foreach ($productsData as $pd) {
            $products[$pd['sku']] = Product::create($pd);
        }

        // Suppliers
        $supNexa = Supplier::create([
            'code' => 'SUP-NEXA',
            'company_name' => 'NexaCore Enterprise Distribution Pte Ltd',
            'contact_person' => 'Victor Tan',
            'email' => 'procurement@nexacore-dist.sg',
            'phone' => '+65 6789-4120',
            'address' => '18 Tai Seng Street, #06-02',
            'city' => 'Singapore',
            'tax_id' => 'SG-201809412K',
            'payment_terms' => 'Net 30',
        ]);

        $supZebra = Supplier::create([
            'code' => 'SUP-AUTOID',
            'company_name' => 'PT AutoID Solusi Nusantara',
            'contact_person' => 'Hendra Wijaya',
            'email' => 'sales@autoidnusantara.co.id',
            'phone' => '+62 21-5290-3311',
            'address' => 'Menara Sudirman Lt. 14, Jl. Jend. Sudirman',
            'city' => 'Jakarta',
            'tax_id' => '01.394.882.1-022.000',
            'payment_terms' => 'Net 45',
        ]);

        $supPack = Supplier::create([
            'code' => 'SUP-PRIMA',
            'company_name' => 'PT Prima Kemas Industri',
            'contact_person' => 'Siti Rahmawati',
            'email' => 'orders@primakemas.co.id',
            'phone' => '+62 21-8983-1120',
            'address' => 'Kawasan Industri Jababeka Tahap II Blok EE-4',
            'city' => 'Cikarang',
            'tax_id' => '02.811.440.9-413.000',
            'payment_terms' => 'Net 14',
        ]);

        /** @var StockOperationService $stockOps */
        $stockOps = app(StockOperationService::class);
        /** @var PurchaseOrderService $poService */
        $poService = app(PurchaseOrderService::class);
        /** @var StockTransferService $transferService */
        $transferService = app(StockTransferService::class);
        /** @var StockAdjustmentService $adjustmentService */
        $adjustmentService = app(StockAdjustmentService::class);

        // 1. Historical Initial Stock-In Loads (10–12 days ago)
        $stockOps->recordDirectStockIn([
            'warehouse_id' => $whJkt->id,
            'supplier_id' => $supNexa->id,
            'transaction_date' => now()->subDays(12)->toDateString(),
            'notes' => 'Initial Q4 Core Network & Power allocation for Jakarta Central Hub',
            'items' => [
                ['product_id' => $products['NET-SW-24P']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 38, 'unit_cost' => 9500000.00],
                ['product_id' => $products['NET-AP-6E']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 54, 'unit_cost' => 3650000.00],
                ['product_id' => $products['NET-SFP-10G']->id, 'warehouse_location_id' => $locJktB2->id, 'quantity' => 110, 'unit_cost' => 580000.00],
                ['product_id' => $products['PWR-UPS-3K']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 11, 'unit_cost' => 17250000.00],
                ['product_id' => $products['PWR-PDU-16A']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 14, 'unit_cost' => 2750000.00], // Intentionally near/below min stock 18!
            ],
        ], $managerJkt);

        $stockOps->recordDirectStockIn([
            'warehouse_id' => $whSby->id,
            'supplier_id' => $supPack->id,
            'transaction_date' => now()->subDays(10)->toDateString(),
            'notes' => 'East Java packaging consumables & AIDC stock replenishment',
            'items' => [
                ['product_id' => $products['PCK-LBL-100']->id, 'warehouse_location_id' => $locSbyS1->id, 'quantity' => 220, 'unit_cost' => 125000.00],
                ['product_id' => $products['PCK-WRP-500']->id, 'warehouse_location_id' => $locSbyS1->id, 'quantity' => 65, 'unit_cost' => 360000.00], // Below global min 80!
                ['product_id' => $products['AIDC-SCN-2D']->id, 'warehouse_location_id' => $locSbyS1->id, 'quantity' => 26, 'unit_cost' => 4650000.00],
            ],
        ], $managerSby);

        $stockOps->recordDirectStockIn([
            'warehouse_id' => $whBdg->id,
            'supplier_id' => $supZebra->id,
            'transaction_date' => now()->subDays(9)->toDateString(),
            'notes' => 'Bandung regional depot baseline inventory',
            'items' => [
                ['product_id' => $products['AIDC-PRT-4T']->id, 'warehouse_location_id' => $locBdgM1->id, 'quantity' => 8, 'unit_cost' => 7800000.00], // Low stock (min 10)
                ['product_id' => $products['SAF-LSR-DCK']->id, 'warehouse_location_id' => $locBdgM1->id, 'quantity' => 7, 'unit_cost' => 6150000.00], // Low stock (min 10)
            ],
        ], $admin);

        // 2. Purchase Orders & Goods Receipts (Full + Partial + Open Approved + Draft)
        $poCompleted = $poService->create([
            'supplier_id' => $supZebra->id,
            'warehouse_id' => $whJkt->id,
            'order_date' => now()->subDays(8)->toDateString(),
            'expected_delivery_date' => now()->subDays(5)->toDateString(),
            'status' => 'approved',
            'tax_amount' => 29535000.00,
            'discount_amount' => 5000000.00,
            'notes' => 'Urgent warehouse scanner & mobile terminal restock',
            'items' => [
                ['product_id' => $products['AIDC-SCN-2D']->id, 'ordered_quantity' => 20, 'unit_price' => 4650000.00],
                ['product_id' => $products['AIDC-PDT-55']->id, 'ordered_quantity' => 15, 'unit_price' => 11700000.00],
            ],
        ], $managerJkt);

        $poService->receiveGoods($poCompleted, [
            'receipt_date' => now()->subDays(6)->toDateString(),
            'supplier_delivery_note' => 'SJ-AID-88412',
            'notes' => 'All cartons inspected in good condition',
            'items' => $poCompleted->items->map(fn ($it) => [
                'purchase_order_item_id' => $it->id,
                'warehouse_location_id' => $locJktRcv->id,
                'quantity_received' => $it->ordered_quantity,
            ])->all(),
        ], $staffJkt);

        // Partially received PO
        $poPartial = $poService->create([
            'supplier_id' => $supNexa->id,
            'warehouse_id' => $whJkt->id,
            'order_date' => now()->subDays(5)->toDateString(),
            'expected_delivery_date' => now()->addDays(2)->toDateString(),
            'status' => 'approved',
            'tax_amount' => 11154000.00,
            'discount_amount' => 0,
            'notes' => 'Backorder split shipment allowed',
            'items' => [
                ['product_id' => $products['NET-SFP-10G']->id, 'ordered_quantity' => 80, 'unit_price' => 580000.00],
                ['product_id' => $products['PWR-PDU-16A']->id, 'ordered_quantity' => 20, 'unit_price' => 2750000.00],
            ],
        ], $admin);

        $firstPartialItem = $poPartial->items->first();
        $poService->receiveGoods($poPartial, [
            'receipt_date' => now()->subDays(3)->toDateString(),
            'supplier_delivery_note' => 'NX-DO-99104-A',
            'notes' => 'First tranche received; PDUs arriving next week',
            'items' => [
                [
                    'purchase_order_item_id' => $firstPartialItem->id,
                    'warehouse_location_id' => $locJktB2->id,
                    'quantity_received' => 50,
                ],
            ],
        ], $staffJkt);

        // Approved PO awaiting delivery
        $poService->create([
            'supplier_id' => $supPack->id,
            'warehouse_id' => $whSby->id,
            'order_date' => now()->subDays(2)->toDateString(),
            'expected_delivery_date' => now()->addDays(4)->toDateString(),
            'status' => 'approved',
            'tax_amount' => 6022500.00,
            'discount_amount' => 1500000.00,
            'notes' => 'Monthly stretch wrap replenishment for Surabaya hub',
            'items' => [
                ['product_id' => $products['PCK-WRP-500']->id, 'ordered_quantity' => 100, 'unit_price' => 360000.00],
                ['product_id' => $products['PCK-LBL-100']->id, 'ordered_quantity' => 150, 'unit_price' => 125000.00],
            ],
        ], $managerSby);

        // Draft PO awaiting manager review
        $poService->create([
            'supplier_id' => $supZebra->id,
            'warehouse_id' => $whBdg->id,
            'order_date' => now()->toDateString(),
            'expected_delivery_date' => now()->addDays(7)->toDateString(),
            'status' => 'draft',
            'tax_amount' => 17391000.00,
            'discount_amount' => 0,
            'notes' => 'Restock pallet scales (currently zero stock) and thermal printers',
            'items' => [
                ['product_id' => $products['SAF-SCL-2T']->id, 'ordered_quantity' => 6, 'unit_price' => 13350000.00],
                ['product_id' => $products['AIDC-PRT-4T']->id, 'ordered_quantity' => 10, 'unit_price' => 7800000.00],
            ],
        ], $managerJkt);

        // 3. Outbound Stock Dispatches across past days
        $stockOps->recordStockOut([
            'warehouse_id' => $whJkt->id,
            'transaction_date' => now()->subDays(4)->toDateString(),
            'destination' => 'PT Telkom Data Ekosistem — Cikarang DC',
            'notes' => 'Enterprise rack upgrade order #SO-4410',
            'items' => [
                ['product_id' => $products['NET-SW-24P']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 12],
                ['product_id' => $products['NET-SFP-10G']->id, 'warehouse_location_id' => $locJktB2->id, 'quantity' => 45],
            ],
        ], $staffJkt);

        $stockOps->recordStockOut([
            'warehouse_id' => $whSby->id,
            'transaction_date' => now()->subDays(2)->toDateString(),
            'destination' => 'PT Maspion Logistics — Sidoarjo',
            'notes' => 'Fulfillment dispatch #SO-4489',
            'items' => [
                ['product_id' => $products['PCK-LBL-100']->id, 'warehouse_location_id' => $locSbyS1->id, 'quantity' => 85],
                ['product_id' => $products['AIDC-SCN-2D']->id, 'warehouse_location_id' => $locSbyS1->id, 'quantity' => 9],
            ],
        ], $staffSby);

        $stockOps->recordStockOut([
            'warehouse_id' => $whJkt->id,
            'transaction_date' => now()->subDay()->toDateString(),
            'destination' => 'Bank Mandiri Regional IT Tower',
            'notes' => 'Branch Wi-Fi 6E rollout batch #3',
            'items' => [
                ['product_id' => $products['NET-AP-6E']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 18],
                ['product_id' => $products['PWR-UPS-3K']->id, 'warehouse_location_id' => $locJktA1->id, 'quantity' => 4],
            ],
        ], $staffJkt);

        // 4. Inter-Warehouse Stock Transfers (1 Completed, 1 Pending with active stock reservation)
        $transferService->create([
            'source_warehouse_id' => $whJkt->id,
            'destination_warehouse_id' => $whBdg->id,
            'transfer_date' => now()->subDays(3)->toDateString(),
            'notes' => 'Rebalance wireless APs to Bandung regional depot',
            'complete_immediately' => true,
            'items' => [
                [
                    'product_id' => $products['NET-AP-6E']->id,
                    'source_location_id' => $locJktA1->id,
                    'destination_location_id' => $locBdgM1->id,
                    'quantity' => 10,
                ],
            ],
        ], $managerJkt);

        $transferService->create([
            'source_warehouse_id' => $whJkt->id,
            'destination_warehouse_id' => $whSby->id,
            'transfer_date' => now()->toDateString(),
            'notes' => 'Transit allocation of switches to Surabaya East Hub (awaiting receiving confirmation)',
            'complete_immediately' => false,
            'items' => [
                [
                    'product_id' => $products['NET-SW-24P']->id,
                    'source_location_id' => $locJktA1->id,
                    'destination_location_id' => $locSbyS1->id,
                    'quantity' => 6,
                ],
            ],
        ], $managerJkt);

        // 5. Stock Adjustments (1 Approved shrinkage write-off, 1 Pending cycle count awaiting Manager approval)
        $adjustmentService->create([
            'warehouse_id' => $whSby->id,
            'adjustment_date' => now()->subDays(2)->toDateString(),
            'reason' => 'damaged',
            'notes' => '2 rolls of stretch wrap punctured by forklift tine during unloading',
            'approve_immediately' => true,
            'items' => [
                [
                    'product_id' => $products['PCK-WRP-500']->id,
                    'warehouse_location_id' => $locSbyS1->id,
                    'adjusted_quantity' => 63,
                ],
            ],
        ], $managerSby);

        $adjustmentService->create([
            'warehouse_id' => $whJkt->id,
            'adjustment_date' => now()->toDateString(),
            'reason' => 'cycle_count',
            'notes' => 'Weekly physical cycle count on Picking Shelf B2 found 3 extra SFP+ modules from unlogged carton',
            'approve_immediately' => false,
            'items' => [
                [
                    'product_id' => $products['NET-SFP-10G']->id,
                    'warehouse_location_id' => $locJktB2->id,
                    'adjusted_quantity' => 118,
                ],
            ],
        ], $staffJkt);
    }
}
