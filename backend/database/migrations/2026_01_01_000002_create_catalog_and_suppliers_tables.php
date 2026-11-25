<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique('uq_categories_code');
            $table->string('name', 120)->unique('uq_categories_name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('categories')->restrictOnDelete();
            $table->string('sku', 60)->unique('uq_products_sku');
            $table->string('barcode', 80)->nullable()->unique('uq_products_barcode');
            $table->string('name', 180)->index('idx_products_name');
            $table->text('description')->nullable();
            $table->string('unit_of_measure', 30)->default('pcs');
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('selling_price', 15, 2)->default(0);
            $table->unsignedInteger('min_stock_level')->default(0);
            $table->unsignedInteger('reorder_quantity')->default(0);
            $table->string('image_path', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['category_id', 'is_active'], 'idx_products_category_active');
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique('uq_suppliers_code');
            $table->string('company_name', 180)->index('idx_suppliers_company_name');
            $table->string('contact_person', 120)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('phone', 40)->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('tax_id', 60)->nullable();
            $table->string('payment_terms', 60)->default('Net 30');
            $table->boolean('is_active')->default(true)->index('idx_suppliers_active');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
    }
};
