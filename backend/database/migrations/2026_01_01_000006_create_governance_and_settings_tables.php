<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('module', 60);
            $table->string('action', 60);
            $table->string('subject_type', 120)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('description', 255);
            $table->json('properties')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['module', 'created_at'], 'idx_activity_module_created');
            $table->index(['subject_type', 'subject_id'], 'idx_activity_subject');
            $table->index(['user_id', 'created_at'], 'idx_activity_user');
        });

        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('setting_key', 80)->unique('uq_system_settings_key');
            $table->string('setting_group', 40)->default('general');
            $table->text('setting_value')->nullable();
            $table->string('value_type', 20)->default('string');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('idempotency_key', 100);
            $table->string('endpoint', 180);
            $table->char('request_hash', 64);
            $table->unsignedSmallInteger('response_code');
            $table->longText('response_body');
            $table->timestamp('expires_at')->index('idx_idempotency_expires');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'idempotency_key'], 'uq_idempotency_user_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('activity_logs');
    }
};
