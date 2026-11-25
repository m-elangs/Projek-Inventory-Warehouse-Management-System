<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DomainRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\User;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = User::with(['role', 'warehouses:id,code,name']);

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('employee_code', 'like', "%{$search}%");
            });
        }

        if ($roleId = $request->query('role_id')) {
            $query->where('role_id', (int) $roleId);
        }

        if ($request->has('is_active') && $request->query('is_active') !== '') {
            $query->where('is_active', filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $sortBy = $this->safeSortColumn($request->query('sort_by'), ['name', 'email', 'employee_code', 'created_at', 'last_login_at'], 'created_at');
        $sortDir = $this->safeSortDirection($request->query('sort_dir'), 'desc');

        $paginator = $query->orderBy($sortBy, $sortDir)
            ->paginate($this->safePerPage($request->query('per_page'), 15));

        return $this->paginated($paginator, 'Users retrieved successfully.');
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $user = DB::transaction(function () use ($validated) {
            $created = User::create([
                'employee_code' => strtoupper(trim($validated['employee_code'])),
                'name' => $validated['name'],
                'email' => strtolower(trim($validated['email'])),
                'phone' => $validated['phone'] ?? null,
                'password' => $validated['password'],
                'role_id' => $validated['role_id'],
                'is_active' => $validated['is_active'] ?? true,
            ]);

            if (array_key_exists('warehouse_ids', $validated)) {
                $created->warehouses()->sync($validated['warehouse_ids'] ?? []);
            }

            $this->audit->log('users', 'created', "Created employee account {$created->employee_code} ({$created->email}).", $created);

            return $created->load(['role', 'warehouses:id,code,name']);
        });

        return $this->success($user, 'Employee account created successfully.', 201);
    }

    public function show(User $user): JsonResponse
    {
        return $this->success($user->load(['role.permissions', 'warehouses:id,code,name']));
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $validated = $request->validated();

        if (
            array_key_exists('is_active', $validated)
            && !$validated['is_active']
            && $user->id === $request->user()->id
        ) {
            throw new DomainRuleException('You cannot deactivate your own active session account.', [
                'is_active' => ['Self-deactivation is not permitted.'],
            ]);
        }

        $updated = DB::transaction(function () use ($user, $validated) {
            $payload = [];
            foreach (['name', 'phone', 'role_id', 'is_active'] as $field) {
                if (array_key_exists($field, $validated)) {
                    $payload[$field] = $validated[$field];
                }
            }
            if (array_key_exists('employee_code', $validated)) {
                $payload['employee_code'] = strtoupper(trim($validated['employee_code']));
            }
            if (array_key_exists('email', $validated)) {
                $payload['email'] = strtolower(trim($validated['email']));
            }
            if (!empty($validated['password'])) {
                $payload['password'] = $validated['password'];
            }

            $user->update($payload);

            if (array_key_exists('warehouse_ids', $validated)) {
                $user->warehouses()->sync($validated['warehouse_ids'] ?? []);
            }

            if (array_key_exists('is_active', $validated) && !$validated['is_active']) {
                $user->tokens()->delete();
            }

            $this->audit->log('users', 'updated', "Updated employee account {$user->employee_code}.", $user);

            return $user->fresh(['role', 'warehouses:id,code,name']);
        });

        return $this->success($updated, 'Employee account updated successfully.');
    }
}
