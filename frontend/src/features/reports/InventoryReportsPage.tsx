import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download, Search } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Category } from '@/types/domain';
import { PageHeader } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';

interface InventoryReportData {
  summary: {
    total_skus: number;
    total_units_on_hand: number;
    total_available_units: number;
    total_reserved_units: number;
    total_valuation: number;
    healthy_count: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
  by_category: Array<{
    category_id: number;
    category_name: string;
    sku_count: number;
    total_units: number;
    total_value: number;
  }>;
  items: Array<{
    product_id: number;
    sku: string;
    product_name: string;
    category_name: string;
    unit_of_measure: string;
    quantity_on_hand: number;
    reserved_quantity: number;
    available_quantity: number;
    min_stock_level: number;
    unit_cost: number;
    stock_value: number;
    health_status: string;
  }>;
}

export function InventoryReportsPage() {
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [categoryId, setCategoryId] = useState('');
  const [healthStatus, setHealthStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [exporting, setExporting] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => apiClient.get<Category[]>('/categories'),
  });

  const params = {
    warehouse_id: selectedWarehouseId,
    category_id: categoryId || undefined,
    health_status: healthStatus || undefined,
    search: debouncedSearch || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventoryReport(params),
    queryFn: () => apiClient.get<InventoryReportData>('/reports/inventory', params),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiClient.downloadCsv('/reports/inventory/export', params, 'inventory-valuation.csv');
      pushToast({ type: 'success', title: 'Inventory CSV exported' });
    } catch {
      pushToast({ type: 'error', title: 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory Valuation & Stock Health Report"
        description="Financial cost-basis valuation, category asset concentration, and replenishment exposure."
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

      {/* Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-surface border border-line rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-line shadow-panel">
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Total Cost Valuation</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums mt-1">
            {isLoading ? '—' : formatCurrency(summary?.total_valuation)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Units On Hand / Available</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums mt-1">
            {isLoading
              ? '—'
              : `${formatNumber(summary?.total_units_on_hand)} / ${formatNumber(summary?.total_available_units)}`}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Healthy Stock SKUs</div>
          <div className="text-[20px] font-semibold text-status-success tabular-nums mt-1">
            {isLoading ? '—' : formatNumber(summary?.healthy_count)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-ink-secondary">Low / Zero Stock SKUs</div>
          <div className="text-[20px] font-semibold text-status-danger tabular-nums mt-1">
            {isLoading
              ? '—'
              : `${formatNumber(summary?.low_stock_count)} / ${formatNumber(summary?.out_of_stock_count)}`}
          </div>
        </div>
      </div>

      {/* Category Valuation Breakdown Chart */}
      <div className="bg-surface border border-line rounded-lg p-4 shadow-panel">
        <div className="mb-3">
          <h2 className="text-[14px] font-semibold text-ink">Valuation Concentration by Category</h2>
          <p className="text-xs text-ink-secondary">Capital tied up per product category</p>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.by_category ?? []} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E8EC" />
              <XAxis
                dataKey="category_name"
                tick={{ fontSize: 11, fill: '#667085' }}
                axisLine={{ stroke: '#E6E8EC' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#667085' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
                  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}Jt`;
                  return `Rp ${Math.round(n / 1000)}k`;
                }}
              />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Valuation']}
                contentStyle={{ borderRadius: '6px', borderColor: '#D0D5DD', fontSize: '12px' }}
              />
              <Bar dataKey="total_value" fill="#334E85" radius={[3, 3, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed SKU Valuation Table */}
      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              compact
              placeholder="Filter SKU or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select
            compact
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-[225px]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            compact
            value={healthStatus}
            onChange={(e) => setHealthStatus(e.target.value)}
            className="w-[200px]"
          >
            <option value="">All Stock States</option>
            <option value="healthy">In Stock (Healthy)</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">SKU</th>
                <th className="px-3.5 py-2.5">Product</th>
                <th className="px-3.5 py-2.5">Category</th>
                <th className="px-3.5 py-2.5 text-right">On Hand</th>
                <th className="px-3.5 py-2.5 text-right">Reserved</th>
                <th className="px-3.5 py-2.5 text-right">Available</th>
                <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                <th className="px-3.5 py-2.5 text-right">Total Value</th>
                <th className="px-3.5 py-2.5">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-[13px]">
              {(data?.items ?? []).map((row) => (
                <tr key={row.product_id} className="hover:bg-canvas/60">
                  <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-ink">
                    {row.sku}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">{row.product_name}</td>
                  <td className="px-3.5 py-2.5 text-ink-secondary">{row.category_name}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {formatNumber(row.quantity_on_hand)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                    {formatNumber(row.reserved_quantity)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-medium">
                    {formatNumber(row.available_quantity)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                    {formatCurrency(row.unit_cost)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-ink">
                    {formatCurrency(row.stock_value)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <StatusBadge status={row.health_status} />
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
