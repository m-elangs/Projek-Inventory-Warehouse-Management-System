import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  ArrowRight,
  Package,
  Warehouse,
  Clock,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatSignedQuantity } from '@/lib/formatters';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import type { DashboardSummary } from '@/types/domain';
import { PageHeader } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/FormControls';
import { Badge, StatusBadge } from '@/components/ui/Badge';

export function DashboardPage() {
  const { selectedWarehouseId, setQuickStockModal } = useUiStore();
  const { hasPermission } = useAuthStore();
  const [days, setDays] = useState<number>(14);
  const [activityTab, setActivityTab] = useState<'stock_in' | 'stock_out' | 'purchase_orders' | 'transfers'>('stock_in');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedWarehouseId, days),
    queryFn: () =>
      apiClient.get<DashboardSummary>('/dashboard', {
        warehouse_id: selectedWarehouseId,
        days,
      }),
  });

  const kpis = data?.kpis;
  const maxWarehouseVal = Math.max(
    1,
    ...(data?.warehouse_distribution.map((w) => w.total_value) ?? [1])
  );

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Operational Overview"
        description="Real-time inventory valuation, stock velocity, reorder alerts, and ledger activity."
        actions={
          <>
            <Select
              compact
              aria-label="Analytics time range"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-[155px] text-[15px] font-medium h-9"
            >
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </Select>
            {hasPermission('inventory.stock_out') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
                onClick={() => setQuickStockModal('out')}
                className="h-7.5 text-xs px-2.5"
              >
                Dispatch Stock
              </Button>
            )}
            {hasPermission('inventory.stock_in') && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<ArrowDownToLine className="w-3.5 h-3.5" />}
                onClick={() => setQuickStockModal('in')}
                className="h-7.5 text-xs px-2.5"
              >
                Receive Stock
              </Button>
            )}
          </>
        }
      />

      {/* Unified Enterprise Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-surface border border-line rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-line shadow-panel">
        <div className="p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
            <span>Total Inventory Value</span>
            <span className="font-mono text-[10px] text-ink-muted">COST BASIS</span>
          </div>
          <div className="mt-1.5 text-[20px] font-semibold text-ink tabular-nums tracking-tight">
            {isLoading ? '—' : formatCurrency(kpis?.total_inventory_value)}
          </div>
          <div className="mt-1 text-[11px] text-ink-secondary tabular-nums">
            {formatNumber(kpis?.total_units_on_hand)} units on hand ·{' '}
            <span className="text-brand font-medium">{formatNumber(kpis?.total_reserved_units)} reserved</span>
          </div>
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
            <span>Active Catalog SKUs</span>
            <Package className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="mt-1.5 text-[20px] font-semibold text-ink tabular-nums tracking-tight">
            {isLoading ? '—' : formatNumber(kpis?.total_products)}
          </div>
          <div className="mt-1 text-[11px] text-ink-secondary">
            Across {formatNumber(kpis?.active_categories)} product categories
          </div>
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
            <span>Low Stock & Depleted</span>
            <AlertTriangle className="w-3.5 h-3.5 text-status-warning" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold text-ink tabular-nums tracking-tight">
              {isLoading ? '—' : formatNumber(kpis?.low_stock_count)}
            </span>
            {(kpis?.out_of_stock_count ?? 0) > 0 && (
              <Badge variant="danger">{kpis?.out_of_stock_count} zero stock</Badge>
            )}
          </div>
          <div className="mt-1 text-[11px]">
            <Link to="/inventory?status=low_stock" className="text-brand hover:underline font-medium">
              Review reorder thresholds →
            </Link>
          </div>
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
            <span>Active Warehouses</span>
            <Warehouse className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <div className="mt-1.5 text-[20px] font-semibold text-ink tabular-nums tracking-tight">
            {isLoading ? '—' : formatNumber(kpis?.total_warehouses)}
          </div>
          <div className="mt-1 text-[11px] text-ink-secondary tabular-nums">
            {formatNumber(kpis?.open_purchase_orders)} open POs ·{' '}
            {formatNumber(kpis?.pending_transfers)} in-transit transfers
          </div>
        </div>
      </div>

      {/* Pending Operational Queue Banner (Only visible when items require action) */}
      {((kpis?.pending_adjustments ?? 0) > 0 || (kpis?.pending_transfers ?? 0) > 0) && (
        <div className="bg-surface border border-line rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 text-ink">
            <Clock className="w-4 h-4 text-brand shrink-0" />
            <span className="font-medium">Pending Operational Queue:</span>
            <span className="text-ink-secondary">
              {kpis?.pending_transfers ?? 0} pending stock transfer(s) and{' '}
              {kpis?.pending_adjustments ?? 0} adjustment request(s) awaiting review.
            </span>
          </div>
          <div className="flex items-center gap-3">
            {(kpis?.pending_transfers ?? 0) > 0 && (
              <Link to="/stock-transfers" className="text-xs font-semibold text-brand hover:underline">
                View Transfers ({kpis?.pending_transfers})
              </Link>
            )}
            {(kpis?.pending_adjustments ?? 0) > 0 && (
              <Link to="/stock-adjustments" className="text-xs font-semibold text-brand hover:underline">
                Review Adjustments ({kpis?.pending_adjustments})
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Primary Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Stock Movement Overview */}
        <div className="lg:col-span-7 bg-surface border border-line rounded-lg p-3.5 shadow-panel">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">Stock Movement Flow</h2>
              <p className="text-[11px] text-ink-secondary">
                Daily inbound receipts vs. outbound dispatches (units)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#16845B]" /> Inbound
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#334E85]" /> Outbound
              </span>
            </div>
          </div>

          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.movement_trends ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E8EC" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#667085' }}
                  axisLine={{ stroke: '#E6E8EC' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#667085' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#D0D5DD',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="inbound" name="Inbound Units" fill="#16845B" radius={[2, 2, 0, 0]} maxBarSize={20} />
                <Bar dataKey="outbound" name="Outbound Units" fill="#334E85" radius={[2, 2, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory Valuation Trend */}
        <div className="lg:col-span-5 bg-surface border border-line rounded-lg p-3.5 shadow-panel">
          <div className="mb-3">
            <h2 className="text-[13px] font-semibold text-ink">Inventory Valuation Trend</h2>
            <p className="text-[11px] text-ink-secondary">
              Closing daily stock valuation across selected scope
            </p>
          </div>

          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.movement_trends ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E8EC" />
                <XAxis
                  dataKey="label"
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
                  formatter={(value: number) => [formatCurrency(value), 'Closing Value']}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#D0D5DD',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="inventory_value"
                  stroke="#334E85"
                  strokeWidth={2}
                  fill="#334E85"
                  fillOpacity={0.08}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Middle Section: Warehouse Stock Distribution + Top Moving SKUs + Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Stock Distribution by Warehouse */}
        <div className="lg:col-span-4 bg-surface border border-line rounded-lg p-3.5 shadow-panel flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">Stock by Warehouse</h2>
              <p className="text-xs text-ink-secondary">Valuation and unit distribution</p>
            </div>
            <Link to="/warehouses" className="text-xs font-medium text-brand hover:underline">
              Facilities
            </Link>
          </div>

          <div className="space-y-3.5 flex-1">
            {(data?.warehouse_distribution ?? []).map((wh) => {
              const pct = Math.max(4, Math.round((wh.total_value / maxWarehouseVal) * 100));
              return (
                <div key={wh.warehouse_id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <div className="min-w-0 truncate">
                      <span className="font-mono text-xs font-semibold text-ink">{wh.code}</span>
                      <span className="text-ink-secondary ml-1.5 truncate">{wh.name}</span>
                    </div>
                    <span className="font-semibold text-ink tabular-nums shrink-0 ml-2">
                      {formatCurrency(wh.total_value)}
                    </span>
                  </div>
                  <div className="h-2 bg-canvas rounded-sm overflow-hidden border border-line">
                    <div className="h-full bg-brand rounded-sm" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-secondary tabular-nums">
                    <span>{formatNumber(wh.total_units)} units</span>
                    <span>{wh.active_skus} stocked SKUs</span>
                  </div>
                </div>
              );
            })}
            {!isLoading && (data?.warehouse_distribution.length ?? 0) === 0 && (
              <p className="text-xs text-ink-secondary py-6 text-center">No warehouse data in scope.</p>
            )}
          </div>
        </div>

        {/* Top Moving Products */}
        <div className="lg:col-span-4 bg-surface border border-line rounded-lg shadow-panel overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">Top Moving SKUs (30d)</h2>
              <p className="text-xs text-ink-secondary">Highest ledger turnover volume</p>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-3.5 py-2">SKU / Item</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3.5 py-2 text-right">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(data?.top_moving_products ?? []).map((item) => (
                  <tr key={item.product_id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2 max-w-[180px]">
                      <div className="font-mono text-xs font-medium text-ink">{item.sku}</div>
                      <div className="text-[11px] text-ink-secondary truncate">{item.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-status-success font-medium">
                      +{formatNumber(item.inbound_units)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums text-ink font-medium">
                      -{formatNumber(item.outbound_units)}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.top_moving_products.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-xs text-ink-secondary">
                      No movements recorded in the past 30 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actionable Low Stock Alerts */}
        <div className="lg:col-span-4 bg-surface border border-line rounded-lg shadow-panel overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">Low Stock Alerts</h2>
              <p className="text-xs text-ink-secondary">Items at or below minimum threshold</p>
            </div>
            <Link
              to="/purchase-orders"
              className="text-xs font-medium text-brand hover:underline inline-flex items-center gap-1"
            >
              Create PO <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-3.5 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Avail</th>
                  <th className="px-3.5 py-2 text-right">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(data?.low_stock_alerts ?? []).map((alert) => (
                  <tr key={alert.product_id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium text-ink">{alert.sku}</span>
                        {alert.available_quantity === 0 && <Badge variant="danger">0</Badge>}
                      </div>
                      <div className="text-xs text-ink-secondary truncate">{alert.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-status-danger">
                      {formatNumber(alert.available_quantity)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {formatNumber(alert.min_stock_level)}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.low_stock_alerts.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-xs text-ink-secondary">
                      All active SKUs exceed minimum stock thresholds.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Operational Activity Feed */}
      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Recent Operational Transactions</h2>
            <p className="text-xs text-ink-secondary">
              Latest verified receipts, outbound dispatches, purchase orders, and inter-warehouse transfers
            </p>
          </div>

          <div className="inline-flex rounded-md border border-line bg-canvas p-0.5 text-xs">
            {(
              [
                ['stock_in', 'Stock In'],
                ['stock_out', 'Stock Out'],
                ['purchase_orders', 'Purchase Orders'],
                ['transfers', 'Transfers'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivityTab(key)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  activityTab === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {(activityTab === 'stock_in' || activityTab === 'stock_out') && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-4 py-2.5">Movement #</th>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Warehouse</th>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5 text-right">Qty Delta</th>
                  <th className="px-4 py-2.5">Operator</th>
                  <th className="px-4 py-2.5 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(data?.recent_activity[activityTab] ?? []).map((m) => (
                  <tr key={m.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink">{m.movement_number}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-medium text-ink mr-1.5">
                        {m.product?.sku}
                      </span>
                      <span className="text-ink-secondary">{m.product?.name}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-secondary">
                      {m.warehouse?.code}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-brand">{m.reference_number}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                        m.quantity_change > 0 ? 'text-status-success' : 'text-status-warning'
                      }`}
                    >
                      {formatSignedQuantity(m.quantity_change)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">{m.performer?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-ink-secondary">
                      {formatDateTime(m.occurred_at)}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.recent_activity[activityTab].length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-ink-secondary">
                      No recent transactions in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activityTab === 'purchase_orders' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-4 py-2.5">PO Number</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Warehouse</th>
                  <th className="px-4 py-2.5">Order Date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(data?.recent_activity.purchase_orders ?? []).map((po) => (
                  <tr key={po.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-brand">
                      <Link to="/purchase-orders" className="hover:underline">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink">{po.supplier?.company_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-secondary">
                      {po.warehouse?.code}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-secondary">
                      {formatDate(po.order_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink">
                      {formatCurrency(po.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activityTab === 'transfers' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-4 py-2.5">Transfer #</th>
                  <th className="px-4 py-2.5">Source Facility</th>
                  <th className="px-4 py-2.5">Destination Facility</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(data?.recent_activity.transfers ?? []).map((trf) => (
                  <tr key={trf.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-brand">
                      <Link to="/stock-transfers" className="hover:underline">
                        {trf.transfer_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      <span className="font-mono text-xs mr-1">{trf.source_warehouse?.code}</span>
                      <span className="text-ink-secondary">{trf.source_warehouse?.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      <span className="font-mono text-xs mr-1">{trf.destination_warehouse?.code}</span>
                      <span className="text-ink-secondary">{trf.destination_warehouse?.name}</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-secondary">
                      {formatDate(trf.transfer_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={trf.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
