<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'role_id',
        'employee_code',
        'name',
        'email',
        'phone',
        'password',
        'is_active',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'last_login_at' => 'datetime',
        'is_active' => 'boolean',
        'password' => 'hashed',
    ];

    private ?array $cachedPermissionSlugs = null;
    private ?array $cachedWarehouseIds = null;

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function warehouses(): BelongsToMany
    {
        return $this->belongsToMany(Warehouse::class, 'user_warehouses')
            ->withPivot('created_at');
    }

    public function managedWarehouses(): HasMany
    {
        return $this->hasMany(Warehouse::class, 'manager_id');
    }

    public function isAdmin(): bool
    {
        return $this->role?->slug === 'admin';
    }

    public function isWarehouseManager(): bool
    {
        return $this->role?->slug === 'warehouse_manager';
    }

    public function isWarehouseStaff(): bool
    {
        return $this->role?->slug === 'warehouse_staff';
    }

    public function permissionSlugs(): array
    {
        if ($this->cachedPermissionSlugs !== null) {
            return $this->cachedPermissionSlugs;
        }

        if ($this->isAdmin()) {
            return $this->cachedPermissionSlugs = Permission::pluck('slug')->all();
        }

        $this->loadMissing('role.permissions');

        return $this->cachedPermissionSlugs = ($this->role?->permissions->pluck('slug')->all() ?? []);
    }

    public function hasPermission(string $permissionSlug): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->isAdmin()) {
            return true;
        }

        return in_array($permissionSlug, $this->permissionSlugs(), true);
    }

    public function hasAnyPermission(array $slugs): bool
    {
        foreach ($slugs as $slug) {
            if ($this->hasPermission($slug)) {
                return true;
            }
        }

        return false;
    }

    public function accessibleWarehouseIds(): array
    {
        if ($this->cachedWarehouseIds !== null) {
            return $this->cachedWarehouseIds;
        }

        if ($this->isAdmin()) {
            return $this->cachedWarehouseIds = Warehouse::pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        $assigned = $this->warehouses()->pluck('warehouses.id')->all();
        $managed = $this->managedWarehouses()->pluck('id')->all();

        return $this->cachedWarehouseIds = array_values(array_unique(array_map('intval', array_merge($assigned, $managed))));
    }

    public function canAccessWarehouse(int $warehouseId): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->isAdmin()) {
            return true;
        }

        return in_array($warehouseId, $this->accessibleWarehouseIds(), true);
    }
}
