<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('warehouse_location_id')->nullable()->constrained('warehouse_locations')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            if (DB::getDriverName() === 'mysql') {
                $table->unsignedBigInteger('location_key')->storedAs('IFNULL(warehouse_location_id, 0)');
            } else {
                $table->unsignedBigInteger('location_key')->default(0);
            }
            $table->integer('quantity_on_hand')->default(0);
            $table->integer('reserved_quantity')->default(0);
            $table->timestamp('last_movement_at')->nullable();
            $table->timestamps();

            $table->unique(['warehouse_id', 'product_id', 'location_key'], 'uq_inventory_stock_slot');
            $table->index('product_id', 'idx_inventory_product');
            $table->index(['warehouse_id', 'quantity_on_hand'], 'idx_inventory_warehouse_qty');
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->string('movement_number', 50)->unique('uq_stock_movements_number');
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('warehouse_location_id')->nullable()->constrained('warehouse_locations')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->string('movement_type', 40);
            $table->integer('quantity_change');
            $table->integer('balance_before');
            $table->integer('balance_after');
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->string('reference_type', 60);
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('reference_number', 60);
            $table->string('destination', 180)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['warehouse_id', 'product_id', 'occurred_at'], 'idx_movements_wh_prod_date');
            $table->index(['movement_type', 'occurred_at'], 'idx_movements_type_date');
            $table->index(['reference_type', 'reference_id'], 'idx_movements_reference');
            $table->index('occurred_at', 'idx_movements_occurred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('inventory_stocks');
    }
};
