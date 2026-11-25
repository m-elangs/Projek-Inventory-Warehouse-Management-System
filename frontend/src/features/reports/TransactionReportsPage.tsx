import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDateTime, formatNumber, formatSignedQuantity } from '@/lib/formatters';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { PageHeader } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';

interface TransactionReportData {
  period: { date_from: string; date_to: string };
  summary: {
    total_transactions: number;
    total_inbound_units: number;
    total_outbound_units: number;
    total_inbound_value: number;
    total_outbound_value: number;
  };
  by_type: Array<{
    movement_type: string;
    transaction_count: number;
    total_units: number;
    total_value: number;
  }>;
  movements: Array<{
    id: number;
    movement_number: string;
    movement_type: string;
    sku: string;
    product_name: string;
    warehouse_code: string;
    quantity_change: number;
    balance_before: number;
    balance_after: number;
    unit_cost: number;
    line_value: number;
    reference_number: string;
    performed_by_name: string;
    occurred_at: string;
  }>;
}

export function TransactionReportsPage() {
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [movementType, setMovementType] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = {
    warehouse_id: selectedWarehouseId,
    date_from: dateFrom,
    date_to: dateTo,
    movement_type: movementType || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.transactionReport(params),
    queryFn: () => apiClient.get<TransactionReportData>('/reports/transactions', params),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiClient.downloadCsv('/reports/transactions/export', params, 'transaction-audit.csv');
      pushToast({ type: 'success', title: 'Transaction report CSV exported' });
    } catch {
      pushToast({ type: 'error', title: 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transaction & Ledger Audit Report"
        description="Period-over-period inbound/outbound volume reconciliation and costed ledger export."
        actions={
          hasPermission('reports.export') ? (
            <Button
              variant="secondary"
              size="sm"
              loading={exporting}
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExport}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-surface border border-line rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-line shadow-panel">
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Ledger Entries</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums mt-1">
            {isLoading ? '—' : formatNumber(s?.total_transactions)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Total Inbound Volume</div>
          <div className="text-[20px] font-semibold text-status-success tabular-nums mt-1">
            +{formatNumber(s?.total_inbound_units)}
          </div>
          <div className="text-xs text-ink-secondary tabular-nums mt-0.5">
            {formatCurrency(s?.total_inbound_value)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Total Outbound Volume</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums mt-1">
            -{formatNumber(s?.total_outbound_units)}
          </div>
          <div className="text-xs text-ink-secondary tabular-nums mt-0.5">
            {formatCurrency(s?.total_outbound_value)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Net Period Value Delta</div>
          <div className="text-[20px] font-semibold text-brand tabular-nums mt-1">
            {formatCurrency((s?.total_inbound_value ?? 0) - (s?.total_outbound_value ?? 0))}
          </div>
        </div>
      </div>

      {/* Breakdown by Movement Type */}
      {(data?.by_type.length ?? 0) > 0 && (
        <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-canvas text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Activity Breakdown by Transaction Type
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {data?.by_type.map((t) => (
              <div key={t.movement_type} className="p-3.5 space-y-1">
                <StatusBadge status={t.movement_type} />
                <div className="text-sm font-semibold text-ink tabular-nums pt-1">
                  {formatNumber(t.total_units)} units
                </div>
                <div className="text-[11px] text-ink-secondary tabular-nums">
                  {t.transaction_count} tx · {formatCurrency(t.total_value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filterable Detailed Ledger */}
      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span>From:</span>
            <Input
              compact
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[145px]"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span>To:</span>
            <Input
              compact
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[145px]"
            />
          </div>

          <Select
            compact
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            className="w-[225px]"
          >
            <option value="">All Movement Types</option>
            <option value="stock_in">Direct Stock In</option>
            <option value="purchase_receipt">PO Receipt</option>
            <option value="stock_out">Stock Out</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="transfer_in">Transfer In</option>
            <option value="adjustment_in">Adjustment (+)</option>
            <option value="adjustment_out">Adjustment (-)</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">Movement #</th>
                <th className="px-3.5 py-2.5">Type</th>
                <th className="px-3.5 py-2.5">SKU / Product</th>
                <th className="px-3.5 py-2.5">Facility</th>
                <th className="px-3.5 py-2.5 text-right">Qty Delta</th>
                <th className="px-3.5 py-2.5 text-right">After</th>
                <th className="px-3.5 py-2.5 text-right">Value</th>
                <th className="px-3.5 py-2.5">Reference</th>
                <th className="px-3.5 py-2.5">Operator</th>
                <th className="px-3.5 py-2.5 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-[13px]">
              {(data?.movements ?? []).map((m) => (
                <tr key={m.id} className="hover:bg-canvas/60">
                  <td className="px-3.5 py-2.5 font-mono text-xs text-ink">{m.movement_number}</td>
                  <td className="px-3.5 py-2.5">
                    <StatusBadge status={m.movement_type} />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="font-mono text-xs font-semibold text-ink mr-1.5">{m.sku}</span>
                    <span className="text-ink-secondary">{m.product_name}</span>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-ink-secondary">
                    {m.warehouse_code}
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-right tabular-nums font-semibold ${
                      m.quantity_change > 0 ? 'text-status-success' : 'text-status-danger'
                    }`}
                  >
                    {formatSignedQuantity(m.quantity_change)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{m.balance_after}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-medium">
                    {formatCurrency(m.line_value)}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-brand">
                    {m.reference_number}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-ink-secondary">
                    {m.performed_by_name}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-xs text-ink-secondary">
                    {formatDateTime(m.occurred_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
