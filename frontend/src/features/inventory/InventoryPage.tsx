import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw, Search, Boxes } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import type { Category, InventoryStockRow } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';

export function InventoryPage() {
  const [searchParams] = useSearchParams();
  const { selectedWarehouseId, setQuickStockModal } = useUiStore();
  const { hasPermission } = useAuthStore();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [categoryId, setCategoryId] = useState('');
  const [stockStatus, setStockStatus] = useState(searchParams.get('status') || '');
  const [sortBy, setSortBy] = useState('last_movement_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories({ active_only: true }),
    queryFn: () => apiClient.get<Category[]>('/categories', { active_only: true }),
  });

  const queryParams = {
    warehouse_id: selectedWarehouseId,
    search: debouncedSearch,
    category_id: categoryId || undefined,
    stock_status: stockStatus || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    page,
    per_page: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory(queryParams),
    queryFn: () => apiClient.getPaginated<InventoryStockRow>('/inventory', queryParams),
  });

  const hasFilters = Boolean(search || categoryId || stockStatus);

  const resetFilters = () => {
    setSearch('');
    setCategoryId('');
    setStockStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Real-Time Inventory"
        description="Live on-hand, reserved, and available stock balances across warehouses and bin locations."
        actions={
          <>
            {hasPermission('inventory.stock_in') && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<ArrowDownToLine className="w-3.5 h-3.5" />}
                onClick={() => setQuickStockModal('in')}
              >
                Stock In
              </Button>
            )}
            {hasPermission('inventory.stock_out') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
                onClick={() => setQuickStockModal('out')}
              >
                Stock Out
              </Button>
            )}
          </>
        }
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        {/* Filter Bar */}
        <div className="px-4 py-3.5 border-b border-line flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              compact
              placeholder="Search SKU, product name, warehouse, or bin..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9.5 text-[15px]"
            />
          </div>

          <Select
            compact
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[245px] text-[16px]"
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
            value={stockStatus}
            onChange={(e) => {
              setStockStatus(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[215px] text-[16px]"
          >
            <option value="">All Health States</option>
            <option value="healthy">In Stock (Healthy)</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </Select>

          <Select
            compact
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [col, dir] = e.target.value.split(':');
              setSortBy(col);
              setSortDir(dir as 'asc' | 'desc');
            }}
            className="w-full sm:w-[240px] text-[16px]"
          >
            <option value="last_movement_at:desc">Sort: Latest Activity</option>
            <option value="quantity_on_hand:desc">Sort: Highest Stock</option>
            <option value="quantity_on_hand:asc">Sort: Lowest Stock</option>
            <option value="sku:asc">Sort: SKU (A–Z)</option>
            <option value="product_name:asc">Sort: Product (A–Z)</option>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={resetFilters}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Inventory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">SKU / Product</th>
                <th className="px-3.5 py-2.5">Facility & Bin</th>
                <th className="px-3.5 py-2.5 text-right">On Hand</th>
                <th className="px-3.5 py-2.5 text-right">Reserved</th>
                <th className="px-3.5 py-2.5 text-right">Available</th>
                <th className="px-3.5 py-2.5 text-right">Min Level</th>
                <th className="px-3.5 py-2.5 text-right">Valuation</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Last Moved</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={8} columns={9} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<Boxes className="w-5 h-5" />}
                      title="No inventory stock slots found"
                      description="Adjust your search filters or record an initial Stock In transaction to populate balances."
                      action={
                        hasPermission('inventory.stock_in') ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setQuickStockModal('in')}
                          >
                            Record Stock In
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs font-semibold text-ink">{row.sku}</div>
                      <div className="text-ink truncate max-w-[250px]">{row.product_name}</div>
                      <div className="text-[11px] text-ink-secondary">{row.category_name}</div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs font-medium text-ink">
                        {row.warehouse_code}
                        {row.location_code && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-canvas border border-line text-[11px] text-ink-secondary">
                            {row.location_code}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-secondary truncate max-w-[190px]">
                        {row.warehouse_name}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-ink">
                      {formatNumber(row.quantity_on_hand)}{' '}
                      <span className="text-[11px] text-ink-muted">{row.unit_of_measure}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {row.reserved_quantity > 0 ? (
                        <span className="text-brand font-medium">
                          {formatNumber(row.reserved_quantity)}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-ink">
                      {formatNumber(row.available_quantity)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {formatNumber(row.min_stock_level)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(row.stock_value)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={row.health_status} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-xs text-ink-secondary">
                      {formatDateTime(row.last_movement_at)}
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
