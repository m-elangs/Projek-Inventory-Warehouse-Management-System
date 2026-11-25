import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, RotateCcw, Search } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDateTime, formatNumber, formatSignedQuantity } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import type { StockMovement } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';

export function StockMovementsPage() {
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [movementType, setMovementType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const params = {
    warehouse_id: selectedWarehouseId,
    search: debouncedSearch,
    movement_type: movementType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.movements(params),
    queryFn: () => apiClient.getPaginated<StockMovement>('/inventory/movements', params),
  });

  const hasFilters = Boolean(search || movementType || dateFrom || dateTo);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Movement Ledger"
        description="Immutable append-only audit trail of every inventory addition, dispatch, transfer, and adjustment."
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              compact
              placeholder="Search movement #, reference #, SKU, destination..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>

          <Select
            compact
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value);
              setPage(1);
            }}
            className="w-[220px]"
          >
            <option value="">All Movement Types</option>
            <option value="stock_in">Direct Stock In</option>
            <option value="purchase_receipt">PO Goods Receipt</option>
            <option value="stock_out">Stock Out</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="transfer_in">Transfer In</option>
            <option value="adjustment_in">Adjustment (+)</option>
            <option value="adjustment_out">Adjustment (-)</option>
          </Select>

          <Input
            compact
            type="date"
            aria-label="From date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-[145px]"
          />

          <Input
            compact
            type="date"
            aria-label="To date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-[145px]"
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => {
                setSearch('');
                setMovementType('');
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
            >
              Reset
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">Movement #</th>
                <th className="px-3.5 py-2.5">Type</th>
                <th className="px-3.5 py-2.5">SKU / Product</th>
                <th className="px-3.5 py-2.5">Warehouse</th>
                <th className="px-3.5 py-2.5 text-right">Before</th>
                <th className="px-3.5 py-2.5 text-right">Change</th>
                <th className="px-3.5 py-2.5 text-right">After</th>
                <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                <th className="px-3.5 py-2.5">Reference</th>
                <th className="px-3.5 py-2.5">Operator</th>
                <th className="px-3.5 py-2.5 text-right">Occurred At</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={8} columns={11} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      icon={<ArrowLeftRight className="w-5 h-5" />}
                      title="No stock movements found"
                      description="Ledger entries appear automatically whenever stock is received, shipped, transferred, or adjusted."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((m) => (
                  <tr key={m.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-ink">{m.movement_number}</td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={m.movement_type} />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs font-semibold text-ink">{m.product?.sku}</div>
                      <div className="text-xs text-ink-secondary truncate max-w-[200px]">
                        {m.product?.name}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs text-ink">{m.warehouse?.code}</div>
                      {m.location && (
                        <div className="font-mono text-[11px] text-ink-secondary">
                          {m.location.code}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {formatNumber(m.balance_before)}
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right tabular-nums font-semibold ${
                        m.quantity_change > 0 ? 'text-status-success' : 'text-status-danger'
                      }`}
                    >
                      {formatSignedQuantity(m.quantity_change)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-ink">
                      {formatNumber(m.balance_after)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {formatCurrency(m.unit_cost)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs font-medium text-brand">
                        {m.reference_number}
                      </div>
                      {m.destination && (
                        <div className="text-[11px] text-ink-secondary truncate max-w-[160px]">
                          → {m.destination}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-ink-secondary">
                      {m.performer?.name ?? '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-xs text-ink-secondary">
                      {formatDateTime(m.occurred_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
