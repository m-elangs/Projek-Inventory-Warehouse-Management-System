<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SystemSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'setting_key',
        'setting_group',
        'setting_value',
        'value_type',
        'updated_by',
    ];

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function getValue(string $key, mixed $default = null): mixed
    {
        $row = static::where('setting_key', $key)->first();
        if (!$row) {
            return $default;
        }

        return match ($row->value_type) {
            'boolean' => filter_var($row->setting_value, FILTER_VALIDATE_BOOLEAN),
            'integer' => (int) $row->setting_value,
            'json' => json_decode((string) $row->setting_value, true),
            default => $row->setting_value,
        };
    }
}
