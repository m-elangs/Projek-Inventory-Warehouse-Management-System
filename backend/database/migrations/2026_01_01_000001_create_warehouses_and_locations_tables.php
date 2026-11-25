<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique('uq_warehouses_code');
            $table->string('name', 150);
            $table->text('address');
            $table->string('city', 100)->nullable();
            $table->string('phone', 30)->nullable();
            $table->foreignId('manager_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_active')->default(true)->index('idx_warehouses_active');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('warehouse_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 120);
            $table->string('zone', 50)->nullable();
            $table->enum('location_type', ['receiving', 'storage', 'picking', 'staging', 'returns'])->default('storage');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['warehouse_id', 'code'], 'uq_warehouse_location_code');
            $table->index(['warehouse_id', 'is_active'], 'idx_warehouse_locations_active');
        });

        Schema::create('user_warehouses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'warehouse_id'], 'uq_user_warehouse');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_warehouses');
        Schema::dropIfExists('warehouse_locations');
        Schema::dropIfExists('warehouses');
    }
};
