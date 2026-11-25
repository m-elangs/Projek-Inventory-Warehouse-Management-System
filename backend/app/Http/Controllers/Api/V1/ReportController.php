<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports
    ) {}

    public function inventory(Request $request): JsonResponse
    {
        if (!empty($request->query('warehouse_id'))) {
            $this->authorizeWarehouse($request->user(), (int) $request->query('warehouse_id'));
        }

        $report = $this->reports->getInventoryValuationReport($request->user(), $request->only([
            'warehouse_id',
            'category_id',
            'health_status',
            'search',
        ]));

        return $this->success($report, 'Inventory valuation report generated.');
    }

    public function inventoryCsv(Request $request): StreamedResponse
    {
        if (!empty($request->query('warehouse_id'))) {
            $this->authorizeWarehouse($request->user(), (int) $request->query('warehouse_id'));
        }

        $report = $this->reports->getInventoryValuationReport($request->user(), $request->only([
            'warehouse_id',
            'category_id',
            'health_status',
            'search',
        ]));

        $filename = 'strata-inventory-report-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($report) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'SKU',
                'Product Name',
                'Category',
                'UoM',
                'On Hand',
                'Reserved',
                'Available',
                'Min Stock',
                'Status',
                'Unit Cost',
                'Total Value',
            ]);

            foreach ($report['items'] as $item) {
                fputcsv($handle, [
                    $item['sku'],
                    $item['product_name'],
                    $item['category_name'],
                    $item['unit_of_measure'],
                    $item['quantity_on_hand'],
                    $item['reserved_quantity'],
                    $item['available_quantity'],
                    $item['min_stock_level'],
                    $item['health_status'],
                    number_format($item['unit_cost'], 2, '.', ''),
                    number_format($item['stock_value'], 2, '.', ''),
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        if (!empty($request->query('warehouse_id'))) {
            $this->authorizeWarehouse($request->user(), (int) $request->query('warehouse_id'));
        }

        $report = $this->reports->getTransactionReport($request->user(), $request->only([
            'warehouse_id',
            'movement_type',
            'product_id',
            'date_from',
            'date_to',
        ]));

        return $this->success($report, 'Transaction movement report generated.');
    }

    public function transactionsCsv(Request $request): StreamedResponse
    {
        if (!empty($request->query('warehouse_id'))) {
            $this->authorizeWarehouse($request->user(), (int) $request->query('warehouse_id'));
        }

        $report = $this->reports->getTransactionReport($request->user(), $request->only([
            'warehouse_id',
            'movement_type',
            'product_id',
            'date_from',
            'date_to',
        ]));

        $filename = 'strata-transactions-report-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($report) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'Movement #',
                'Date/Time',
                'Type',
                'Warehouse',
                'SKU',
                'Product',
                'Qty Change',
                'Balance Before',
                'Balance After',
                'Unit Cost',
                'Value',
                'Reference',
                'Operator',
            ]);

            foreach ($report['movements'] as $m) {
                fputcsv($handle, [
                    $m['movement_number'],
                    $m['occurred_at'],
                    $m['movement_type'],
                    $m['warehouse_code'],
                    $m['sku'],
                    $m['product_name'],
                    $m['quantity_change'],
                    $m['balance_before'],
                    $m['balance_after'],
                    number_format($m['unit_cost'], 2, '.', ''),
                    number_format($m['line_value'], 2, '.', ''),
                    $m['reference_number'],
                    $m['performed_by_name'],
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
