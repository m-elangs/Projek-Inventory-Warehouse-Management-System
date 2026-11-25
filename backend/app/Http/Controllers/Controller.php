<?php

namespace App\Http\Controllers;

use App\Exceptions\DomainRuleException;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller as BaseController;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    protected function success(mixed $data = null, string $message = 'OK', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $status);
    }

    protected function paginated(
        LengthAwarePaginator $paginator,
        string $message = 'Data retrieved successfully.',
        ?callable $transformer = null
    ): JsonResponse {
        $items = $paginator->items();
        if ($transformer !== null) {
            $items = array_map($transformer, $items);
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    protected function authorizeWarehouse(User $user, int $warehouseId, string $contextMessage = 'You do not have access to the selected warehouse.'): void
    {
        if (!$user->canAccessWarehouse($warehouseId)) {
            throw new AccessDeniedHttpException($contextMessage);
        }
    }

    protected function safePerPage(mixed $requested, int $default = 15, int $max = 100): int
    {
        $val = (int) ($requested ?: $default);
        if ($val < 1) {
            return $default;
        }
        return min($val, $max);
    }

    protected function safeSortColumn(?string $requested, array $allowed, string $default): string
    {
        if ($requested && in_array($requested, $allowed, true)) {
            return $requested;
        }
        return $default;
    }

    protected function safeSortDirection(?string $requested, string $default = 'desc'): string
    {
        $lower = strtolower((string) $requested);
        if (in_array($lower, ['asc', 'desc'], true)) {
            return $lower;
        }
        return $default;
    }
}
