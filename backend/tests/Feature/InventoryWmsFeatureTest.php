<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryStock;
use App\Models\Product;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\CoreSystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryWmsFeatureTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private User $staff;
    private Warehouse $whJakarta;
    private Warehouse $whSurabaya;
    private Category $category;
    private Product $product;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CoreSystemSeeder::class);

        $this->admin = User::where('email', 'admin@stratawms.io')->firstOrFail();

        $managerRole = Role::where('slug', 'warehouse_manager')->firstOrFail();
        $staffRole = Role::where('slug', 'warehouse_staff')->firstOrFail();

        $this->whJakarta = Warehouse::create([
            'code' => 'WH-TEST-JKT',
            'name' => 'Jakarta Test Hub',
            'address' => 'Pulogadung Block A',
            'city' => 'Jakarta',
            'is_active' => true,
        ]);

        $this->whSurabaya = Warehouse::create([
            'code' => 'WH-TEST-SBY',
            'name' => 'Surabaya Test Hub',
            'address' => 'SIER Rungkut',
            'city' => 'Surabaya',
            'is_active' => true,
        ]);

        $this->manager = User::create([
            'role_id' => $managerRole->id,
            'employee_code' => 'EMP-T100',
            'name' => 'Test Manager',
            'email' => 'test.manager@stratawms.io',
            'password' => 'Password123!',
            'is_active' => true,
        ]);
        $this->manager->warehouses()->sync([$this->whJakarta->id]);

        $this->staff = User::create([
            'role_id' => $staffRole->id,
            'employee_code' => 'EMP-T200',
            'name' => 'Test Staff',
            'email' => 'test.staff@stratawms.io',
            'password' => 'Password123!',
            'is_active' => true,
        ]);
        $this->staff->warehouses()->sync([$this->whJakarta->id]);

        $this->category = Category::create([
            'code' => 'CAT-NET',
            'name' => 'Enterprise Networking',
            'is_active' => true,
        ]);

        $this->product = Product::create([
            'category_id' => $this->category->id,
            'sku' => 'SKU-SW-24',
            'barcode' => '899000111222',
            'name' => '24-Port Managed PoE Switch',
            'unit_of_measure' => 'unit',
            'unit_cost' => 500.00,
            'selling_price' => 680.00,
            'min_stock_level' => 10,
            'reorder_quantity' => 20,
            'is_active' => true,
        ]);

        $this->supplier = Supplier::create([
            'code' => 'SUP-TEST',
            'company_name' => 'Global Tech Vendor Ltd',
            'email' => 'orders@globaltech.example',
            'payment_terms' => 'Net 30',
            'is_active' => true,
        ]);
    }

    public function test_authentication_and_deactivated_account_enforcement(): void
    {
        $loginRes = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stratawms.io',
            'password' => 'Password123!',
        ]);

        $loginRes->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email', 'permissions']]]);

        $badRes = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stratawms.io',
            'password' => 'WrongPassword!',
        ]);
        $badRes->assertStatus(401)->assertJsonPath('success', false);

        // Deactivated user cannot access protected endpoints even with an active token
        $this->staff->update(['is_active' => false]);
        Sanctum::actingAs($this->staff);

        $this->getJson('/api/v1/dashboard')->assertStatus(403);
    }

    public function test_rbac_and_warehouse_scoping_restrictions(): void
    {
        Sanctum::actingAs($this->staff);

        // Staff cannot create products
        $this->postJson('/api/v1/products', [
            'category_id' => $this->category->id,
            'sku' => 'SKU-UNAUTHORIZED',
            'name' => 'Unauthorized Item',
            'unit_of_measure' => 'pcs',
            'unit_cost' => 10,
            'min_stock_level' => 5,
        ])->assertStatus(403);

        // Staff assigned to Jakarta cannot record Stock In into Surabaya
        $this->postJson('/api/v1/inventory/stock-in', [
            'warehouse_id' => $this->whSurabaya->id,
            'transaction_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 10, 'unit_cost' => 500],
            ],
        ])->assertStatus(403);

        // Staff cannot access Admin User Management
        $this->getJson('/api/v1/admin/users')->assertStatus(403);
    }

    public function test_product_management_blocks_archiving_non_zero_stock(): void
    {
        Sanctum::actingAs($this->admin);

        // Stock in 5 units
        $this->postJson('/api/v1/inventory/stock-in', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 5, 'unit_cost' => 500],
            ],
        ])->assertCreated();

        // Attempting to archive product with 5 units in stock must fail with 422
        $this->deleteJson("/api/v1/products/{$this->product->id}")
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        // Stock out all 5 units, then archive succeeds
        $this->postJson('/api/v1/inventory/stock-out', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'destination' => 'Clearance Order',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 5],
            ],
        ])->assertCreated();

        $this->deleteJson("/api/v1/products/{$this->product->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_stock_in_stock_out_negative_stock_prevention_and_idempotency(): void
    {
        Sanctum::actingAs($this->staff);

        $idemKey = 'idem-stock-in-001';
        $payload = [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 25, 'unit_cost' => 500],
            ],
        ];

        $first = $this->withHeaders(['X-Idempotency-Key' => $idemKey])
            ->postJson('/api/v1/inventory/stock-in', $payload);
        $first->assertCreated();

        // Duplicate retry with identical X-Idempotency-Key must NOT double-increment stock!
        $replay = $this->withHeaders(['X-Idempotency-Key' => $idemKey])
            ->postJson('/api/v1/inventory/stock-in', $payload);
        $replay->assertCreated()->assertHeader('X-Idempotent-Replay', 'true');

        $stock = InventoryStock::where('warehouse_id', $this->whJakarta->id)
            ->where('product_id', $this->product->id)
            ->firstOrFail();
        $this->assertSame(25, $stock->quantity_on_hand);
        $this->flushHeaders();

        // Attempting to Stock Out 30 units when only 25 exist must fail with 422
        $this->postJson('/api/v1/inventory/stock-out', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'destination' => 'Customer Order #901',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 30],
            ],
        ])->assertStatus(422);

        $this->assertSame(25, $stock->fresh()->quantity_on_hand);

        // Valid Stock Out of 10 units leaves 15 and writes accurate movement balances
        $this->postJson('/api/v1/inventory/stock-out', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'destination' => 'Customer Order #902',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 10],
            ],
        ])->assertCreated();

        $this->assertSame(15, $stock->fresh()->quantity_on_hand);

        $latestMovement = StockMovement::latest('id')->firstOrFail();
        $this->assertSame(25, $latestMovement->balance_before);
        $this->assertSame(-10, $latestMovement->quantity_change);
        $this->assertSame(15, $latestMovement->balance_after);
    }

    public function test_warehouse_transfer_reservation_completion_and_cancellation(): void
    {
        Sanctum::actingAs($this->admin);

        // Seed 20 units into Jakarta
        $this->postJson('/api/v1/inventory/stock-in', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 20, 'unit_cost' => 500],
            ],
        ])->assertCreated();

        // Create pending transfer of 12 units from Jakarta -> Surabaya
        $transferRes = $this->postJson('/api/v1/stock-transfers', [
            'source_warehouse_id' => $this->whJakarta->id,
            'destination_warehouse_id' => $this->whSurabaya->id,
            'transfer_date' => now()->toDateString(),
            'complete_immediately' => false,
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 12],
            ],
        ])->assertCreated();

        $transferId = $transferRes->json('data.id');

        // Source stock is still 20 on-hand, 12 reserved -> only 8 available!
        $jktStock = InventoryStock::where('warehouse_id', $this->whJakarta->id)
            ->where('product_id', $this->product->id)
            ->firstOrFail();
        $this->assertSame(20, $jktStock->quantity_on_hand);
        $this->assertSame(12, $jktStock->reserved_quantity);
        $this->assertSame(8, $jktStock->available_quantity);

        // Concurrent Stock Out of 10 units must be blocked because only 8 are unreserved!
        $this->postJson('/api/v1/inventory/stock-out', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'destination' => 'Competing Order',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 10],
            ],
        ])->assertStatus(422);

        // Complete the transfer -> Jakarta becomes 8 on-hand (0 reserved), Surabaya becomes 12 on-hand!
        $this->postJson("/api/v1/stock-transfers/{$transferId}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->assertSame(8, $jktStock->fresh()->quantity_on_hand);
        $this->assertSame(0, $jktStock->fresh()->reserved_quantity);

        $sbyStock = InventoryStock::where('warehouse_id', $this->whSurabaya->id)
            ->where('product_id', $this->product->id)
            ->firstOrFail();
        $this->assertSame(12, $sbyStock->quantity_on_hand);

        // Re-completing an already completed transfer must fail with 409
        $this->postJson("/api/v1/stock-transfers/{$transferId}/complete")
            ->assertStatus(409);
    }

    public function test_purchase_order_partial_and_full_receiving_workflow(): void
    {
        Sanctum::actingAs($this->manager);

        $poRes = $this->postJson('/api/v1/purchase-orders', [
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->whJakarta->id,
            'order_date' => now()->toDateString(),
            'status' => 'approved',
            'tax_amount' => 500,
            'discount_amount' => 0,
            'items' => [
                ['product_id' => $this->product->id, 'ordered_quantity' => 20, 'unit_price' => 480.00],
            ],
        ])->assertCreated();

        $poId = $poRes->json('data.id');
        $poItemId = $poRes->json('data.items.0.id');

        // Partial receipt of 12 units by Warehouse Staff
        Sanctum::actingAs($this->staff);
        $this->postJson("/api/v1/purchase-orders/{$poId}/receive", [
            'receipt_date' => now()->toDateString(),
            'supplier_delivery_note' => 'DN-PART-1',
            'items' => [
                ['purchase_order_item_id' => $poItemId, 'quantity_received' => 12],
            ],
        ])->assertCreated();

        $this->getJson("/api/v1/purchase-orders/{$poId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'partially_received');

        // Over-receiving 10 units when only 8 remain must be rejected with 422
        $this->postJson("/api/v1/purchase-orders/{$poId}/receive", [
            'receipt_date' => now()->toDateString(),
            'items' => [
                ['purchase_order_item_id' => $poItemId, 'quantity_received' => 10],
            ],
        ])->assertStatus(422);

        // Receive remaining 8 units -> PO transitions to 'completed' and total stock = 20
        $this->postJson("/api/v1/purchase-orders/{$poId}/receive", [
            'receipt_date' => now()->toDateString(),
            'supplier_delivery_note' => 'DN-PART-2',
            'items' => [
                ['purchase_order_item_id' => $poItemId, 'quantity_received' => 8],
            ],
        ])->assertCreated();

        $this->getJson("/api/v1/purchase-orders/{$poId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $stock = InventoryStock::where('warehouse_id', $this->whJakarta->id)
            ->where('product_id', $this->product->id)
            ->firstOrFail();
        $this->assertSame(20, $stock->quantity_on_hand);
    }

    public function test_stock_adjustment_approval_gate_and_live_concurrency_recalculation(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/inventory/stock-in', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 30, 'unit_cost' => 500],
            ],
        ])->assertCreated();

        // Staff submits cycle count adjustment to 27 units
        Sanctum::actingAs($this->staff);
        $adjRes = $this->postJson('/api/v1/stock-adjustments', [
            'warehouse_id' => $this->whJakarta->id,
            'adjustment_date' => now()->toDateString(),
            'reason' => 'cycle_count',
            'notes' => 'Physical count found 27 units on rack',
            'items' => [
                ['product_id' => $this->product->id, 'adjusted_quantity' => 27],
            ],
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        $adjId = $adjRes->json('data.id');

        // Staff CANNOT self-approve their own adjustment!
        $this->postJson("/api/v1/stock-adjustments/{$adjId}/approve")->assertStatus(403);

        // Intervening concurrent Stock Out deducts 5 units (30 -> 25) BEFORE manager approves!
        $this->postJson('/api/v1/inventory/stock-out', [
            'warehouse_id' => $this->whJakarta->id,
            'transaction_date' => now()->toDateString(),
            'destination' => 'Concurrent Dispatch',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 5],
            ],
        ])->assertCreated();

        // Manager approves adjustment -> live locked calculation adjusts from 25 -> 27 (+2) accurately!
        Sanctum::actingAs($this->manager);
        $this->postJson("/api/v1/stock-adjustments/{$adjId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.items.0.previous_quantity', 25)
            ->assertJsonPath('data.items.0.difference_quantity', 2);

        $stock = InventoryStock::where('warehouse_id', $this->whJakarta->id)
            ->where('product_id', $this->product->id)
            ->firstOrFail();
        $this->assertSame(27, $stock->quantity_on_hand);

        // Verify valuation report reconciles 27 * $500 = $13,500.00
        $reportRes = $this->getJson('/api/v1/reports/inventory?warehouse_id=' . $this->whJakarta->id)
            ->assertOk();
        $this->assertEquals(13500.00, $reportRes->json('data.summary.total_valuation'));
    }
}
