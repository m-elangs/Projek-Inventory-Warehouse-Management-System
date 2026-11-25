<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\DashboardAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardAnalyticsService $analytics
    ) {}

    public function index(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id') ? (int) $request->query('warehouse_id') : null;
        $days = $request->query('days') ? (int) $request->query('days') : 14;

        $summary = $this->analytics->getSummary($request->user(), $warehouseId, $days);

        return $this->success($summary, 'Dashboard summary retrieved.');
    }
}
