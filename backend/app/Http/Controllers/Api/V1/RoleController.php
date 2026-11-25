<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(): JsonResponse
    {
        $roles = Role::with('permissions:id,name,slug,module')
            ->withCount('users')
            ->orderBy('id')
            ->get();

        return $this->success($roles, 'Roles retrieved successfully.');
    }

    public function permissions(): JsonResponse
    {
        $permissions = Permission::orderBy('module')->orderBy('id')->get();

        return $this->success($permissions, 'Permissions catalog retrieved.');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('roles', 'name')],
            'description' => ['nullable', 'string', 'max:255'],
            'permission_ids' => ['required', 'array', 'min:1'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $slug = Str::slug($validated['name'], '_');
        if (Role::where('slug', $slug)->exists()) {
            throw new DomainRuleException('A role with a conflicting identifier already exists.', [
                'name' => ['Role identifier already exists.'],
            ]);
        }

        $role = DB::transaction(function () use ($validated, $slug) {
            $created = Role::create([
                'name' => $validated['name'],
                'slug' => $slug,
                'description' => $validated['description'] ?? null,
                'is_system' => false,
            ]);

            $created->permissions()->sync($validated['permission_ids']);

            $this->audit->log('roles', 'created', "Created custom role {$created->name}.", $created);

            return $created->load('permissions:id,name,slug,module')->loadCount('users');
        });

        return $this->success($role, 'Role created successfully.', 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->slug === 'admin') {
            throw new DomainRuleException('The system Administrator role automatically retains all permissions and cannot be restricted.');
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('roles', 'name')->ignore($role->id)],
            'description' => ['nullable', 'string', 'max:255'],
            'permission_ids' => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $updated = DB::transaction(function () use ($role, $validated) {
            if (!$role->is_system && isset($validated['name'])) {
                $role->name = $validated['name'];
            }
            if (array_key_exists('description', $validated)) {
                $role->description = $validated['description'];
            }
            $role->save();

            $role->permissions()->sync($validated['permission_ids']);

            $this->audit->log('roles', 'updated_permissions', "Updated permissions for role {$role->name}.", $role, [
                'permission_count' => count($validated['permission_ids']),
            ]);

            return $role->fresh('permissions:id,name,slug,module')->loadCount('users');
        });

        return $this->success($updated, 'Role permissions updated successfully.');
    }
}
