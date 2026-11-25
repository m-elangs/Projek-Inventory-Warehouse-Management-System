<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        $user = User::with(['role.permissions', 'warehouses'])
            ->where('email', $credentials['email'])
            ->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid email or password.',
                'errors' => [
                    'email' => ['These credentials do not match our records.'],
                ],
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Your account is inactive. Contact an administrator.',
                'errors' => (object) [],
            ], 403);
        }

        $user->forceFill(['last_login_at' => now()])->save();

        $deviceName = $credentials['device_name'] ?? 'strata-web-client';
        $token = $user->createToken($deviceName)->plainTextToken;

        $this->audit->log(
            'auth',
            'login',
            "User {$user->email} signed in.",
            $user,
            ['device' => $deviceName],
            $user
        );

        return $this->success([
            'token' => $token,
            'user' => $this->serializeUser($user),
        ], 'Signed in successfully.');
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load(['role.permissions', 'warehouses']);

        return $this->success($this->serializeUser($user), 'Authenticated user profile.');
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->audit->log('auth', 'logout', "User {$user->email} signed out.", $user, [], $user);

        $user->currentAccessToken()?->delete();

        return $this->success(null, 'Signed out successfully.');
    }

    public function updateProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'current_password' => ['nullable', 'required_with:new_password', 'string'],
            'new_password' => ['nullable', 'string', 'min:8', 'max:120', 'confirmed'],
        ]);

        if (!empty($validated['new_password'])) {
            if (!Hash::check((string) $validated['current_password'], $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                    'errors' => [
                        'current_password' => ['The provided current password is incorrect.'],
                    ],
                ], 422);
            }
            $user->password = $validated['new_password'];
        }

        $user->name = $validated['name'];
        $user->phone = $validated['phone'] ?? null;
        $user->save();

        $this->audit->log('auth', 'profile_updated', "User {$user->email} updated their profile.", $user);

        return $this->success($this->serializeUser($user->fresh(['role.permissions', 'warehouses'])), 'Profile updated.');
    }

    public static function serializeUser(User $user): array
    {
        $warehouses = $user->isAdmin()
            ? Warehouse::where('is_active', true)->orderBy('code')->get(['id', 'code', 'name'])
            : Warehouse::whereIn('id', $user->accessibleWarehouseIds())
                ->where('is_active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name']);

        return [
            'id' => $user->id,
            'employee_code' => $user->employee_code,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => (bool) $user->is_active,
            'is_admin' => $user->isAdmin(),
            'last_login_at' => $user->last_login_at?->toISOString(),
            'role' => $user->role ? [
                'id' => $user->role->id,
                'name' => $user->role->name,
                'slug' => $user->role->slug,
            ] : null,
            'permissions' => $user->permissionSlugs(),
            'warehouses' => $warehouses->map(fn (Warehouse $w) => [
                'id' => $w->id,
                'code' => $w->code,
                'name' => $w->name,
            ])->values()->all(),
        ];
    }
}
