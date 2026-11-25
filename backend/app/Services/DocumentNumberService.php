<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DocumentNumberService
{
    public function generate(string $prefix, string $table, string $column): string
    {
        $datePart = now()->format('Ymd');
        $basePrefix = strtoupper(trim($prefix, '-')) . '-' . $datePart . '-';

        $latest = DB::table($table)
            ->where($column, 'like', $basePrefix . '%')
            ->lockForUpdate()
            ->orderByDesc('id')
            ->value($column);

        $nextSeq = 1;
        if ($latest && preg_match('/-(\d+)$/', (string) $latest, $matches)) {
            $nextSeq = ((int) $matches[1]) + 1;
        }

        $candidate = $basePrefix . str_pad((string) $nextSeq, 4, '0', STR_PAD_LEFT);

        if (DB::table($table)->where($column, $candidate)->exists()) {
            $candidate .= '-' . strtoupper(Str::random(3));
        }

        return $candidate;
    }
}
