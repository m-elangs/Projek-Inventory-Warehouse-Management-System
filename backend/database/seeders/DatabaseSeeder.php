<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Always bootstrap essential roles, permissions, and default settings
        $this->call(CoreSystemSeeder::class);

        // Strictly isolate Demo Dataset from Production unless explicitly requested
        $seedDemo = env('SEED_DEMO_DATA', app()->environment(['local', 'development']));

        if (filter_var($seedDemo, FILTER_VALIDATE_BOOLEAN) && !app()->environment('production')) {
            $this->call(DemoDatasetSeeder::class);
        }
    }
}
