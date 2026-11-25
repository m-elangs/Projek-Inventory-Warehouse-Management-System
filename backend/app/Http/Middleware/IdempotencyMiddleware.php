<?php

namespace App\Http\Middleware;

use App\Models\IdempotencyKey;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class IdempotencyMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!in_array($request->method(), ['POST', 'PUT', 'PATCH'], true)) {
            return $next($request);
        }

        $key = trim((string) $request->header('X-Idempotency-Key', ''));
        $user = $request->user();

        if ($key === '' || !$user) {
            return $next($request);
        }

        if (strlen($key) > 100) {
            return response()->json([
                'success' => false,
                'message' => 'X-Idempotency-Key must not exceed 100 characters.',
                'errors' => ['idempotency_key' => ['Header length exceeds 100 characters.']],
            ], 422);
        }

        $payloadHash = hash('sha256', $request->method() . '|' . $request->path() . '|' . $request->getContent());

        $existing = IdempotencyKey::where('user_id', $user->id)
            ->where('idempotency_key', $key)
            ->first();

        if ($existing) {
            if ($existing->expires_at->isPast()) {
                $existing->delete();
            } else {
                if (!hash_equals($existing->request_hash, $payloadHash)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This X-Idempotency-Key was already used with a different request payload.',
                        'errors' => (object) [],
                    ], 409);
                }

                return response($existing->response_body, $existing->response_code, [
                    'Content-Type' => 'application/json',
                    'X-Idempotent-Replay' => 'true',
                ]);
            }
        }

        $response = $next($request);

        if ($response->getStatusCode() >= 200 && $response->getStatusCode() < 300) {
            IdempotencyKey::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'idempotency_key' => $key,
                ],
                [
                    'endpoint' => substr($request->path(), 0, 180),
                    'request_hash' => $payloadHash,
                    'response_code' => $response->getStatusCode(),
                    'response_body' => (string) $response->getContent(),
                    'expires_at' => now()->addHours(24),
                ]
            );
        }

        return $response;
    }
}
