import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate, formatNumber, formatSignedQuantity } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Product, StockAdjustment, Warehouse } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/FormControls';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';

const adjustmentSchema = z.object({
  warehouse_id: z.coerce.number().min(1, 'Select warehouse'),
  adjustment_date: z.string().min(1, 'Date required'),
  reason: z.enum([
    'cycle_count',
    'damaged',
    'expired',
    'theft_loss',
    'found_surplus',
    'data_correction',
  ]),
  notes: z.string().min(5, 'Provide a clear audit explanation (min 5 chars)').max(1000),
  approve_immediately: z.boolean().default(false),
  items: z
    .array(
      z.object({
        product_id: z.coerce.number().min(1, 'Select SKU'),
        adjusted_quantity: z.coerce.number().int().min(0, 'Cannot be negative'),
      })
    )
    .min(1, 'Add at least one SKU'),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

const reasonLabels: Record<string, string> = {
  cycle_count: 'Physical Cycle Count',
  damaged: 'Damaged Goods',
  expired: 'Expired Stock',
  theft_loss: 'Shrinkage / Loss',
  found_surplus: 'Unlogged Surplus Found',
  data_correction: 'Data Reconciliation',
};

export function StockAdjustmentsPage() {
  const queryClient = useQueryClient();
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [activeAdjustment, setActiveAdjustment] = useState<StockAdjustment | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const params = {
    warehouse_id: selectedWarehouseId,
    search: debouncedSearch,
    status: statusFilter || undefined,
    page,
    per_page: 15,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adjustments(params),
    queryFn: () => apiClient.getPaginated<StockAdjustment>('/stock-adjustments', params),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses({ active_only: true }),
    queryFn: () => apiClient.get<Warehouse[]>('/warehouses', { active_only: true }),
    enabled: createOpen,
  });

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.products({ all: true, is_active: true }),
    queryFn: () => apiClient.get<Product[]>('/products', { all: true, is_active: true }),
    enabled: createOpen,
  });

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      warehouse_id: selectedWarehouseId ?? 0,
      adjustment_date: today,
      reason: 'cycle_count',
      notes: '',
      approve_immediately: false,
      items: [{ product_id: 0, adjusted_quantity: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (values: AdjustmentFormValues) =>
      apiClient.post<StockAdjustment>('/stock-adjustments', values),
    onSuccess: (adj) => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        type: 'success',
        title: `Adjustment ${adj.adjustment_number} recorded`,
        description:
          adj.status === 'approved'
            ? 'Inventory balances reconciled immediately.'
            : 'Submitted for Warehouse Manager approval.',
      });
      setCreateOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Adjustment rejected',
        description: err instanceof ApiError ? err.message : 'Check input values.',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiClient.post<StockAdjustment>(`/stock-adjustments/${id}/approve`),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setActiveAdjustment(updated);
      pushToast({
        type: 'success',
        title: 'Stock adjustment approved',
        description: 'Ledger variance entries have been posted.',
      });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Approval failed',
        description: err instanceof ApiError ? err.message : 'Unable to apply adjustment.',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      apiClient.post<StockAdjustment>(`/stock-adjustments/${id}/reject`, {
        rejection_reason: rejectionReason,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setActiveAdjustment(updated);
      setShowRejectInput(false);
      setRejectionReason('');
      pushToast({ type: 'warning', title: 'Stock adjustment rejected' });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Adjustments"
        description="Reconcile physical cycle counts and write-offs with mandatory reason codes and manager approval."
        actions={
          hasPermission('adjustments.create') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                reset({
                  warehouse_id: selectedWarehouseId ?? 0,
                  adjustment_date: today,
                  reason: 'cycle_count',
                  notes: '',
                  approve_immediately: false,
                  items: [{ product_id: 0, adjusted_quantity: 0 }],
                });
                setCreateOpen(true);
              }}
            >
              New Adjustment
            </Button>
          ) : undefined
        }
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              compact
              placeholder="Search adjustment number..."
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
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-[210px]"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">Adjustment #</th>
                <th className="px-3.5 py-2.5">Warehouse</th>
                <th className="px-3.5 py-2.5">Reason</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5">Submitted By</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Review</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<SlidersHorizontal className="w-5 h-5" />}
                      title="No stock adjustments found"
                      description="Record physical inventory counts or damage write-offs with full auditability."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((adj) => (
                  <tr key={adj.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-brand">
                      <button
                        type="button"
                        onClick={() => {
                          setShowRejectInput(false);
                          setActiveAdjustment(adj);
                        }}
                        className="hover:underline"
                      >
                        {adj.adjustment_number}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-ink">
                      {adj.warehouse?.code} —{' '}
                      <span className="font-sans text-ink-secondary">{adj.warehouse?.name}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge variant="neutral">{reasonLabels[adj.reason] ?? adj.reason}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5 tabular-nums text-ink-secondary">
                      {formatDate(adj.adjustment_date)}
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{adj.creator?.name}</td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={adj.status} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowRejectInput(false);
                          setActiveAdjustment(adj);
                        }}
                      >
                        {adj.status === 'pending' && hasPermission('adjustments.approve')
                          ? 'Review'
                          : 'Inspect'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Create Adjustment Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record Stock Adjustment"
        description="Enter actual physical counted quantities. System variance is calculated automatically."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={handleSubmit((v) => createMutation.mutate(v))}
            >
              Submit Adjustment
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <FormField label="Warehouse" required error={errors.warehouse_id?.message}>
              <Select {...register('warehouse_id')}>
                <option value={0}>Select warehouse...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Reason Code" required error={errors.reason?.message}>
              <Select {...register('reason')}>
                {Object.entries(reasonLabels).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Count Date" required error={errors.adjustment_date?.message}>
              <Input type="date" {...register('adjustment_date')} />
            </FormField>
          </div>

          <FormField
            label="Mandatory Audit Explanation"
            required
            error={errors.notes?.message}
          >
            <Textarea
              rows={2}
              placeholder="Document why this discrepancy occurred (e.g. Cycle count sheet #CC-19 or damaged pallet report)..."
              {...register('notes')}
            />
          </FormField>

          <div className="border border-line rounded-md overflow-hidden">
            <div className="px-3.5 py-2 bg-canvas border-b border-line flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Counted Products
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => append({ product_id: 0, adjusted_quantity: 0 })}
              >
                Add SKU
              </Button>
            </div>
            <div className="divide-y divide-line">
              {fields.map((field, idx) => (
                <div key={field.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-ink-secondary mb-1">Product</label>
                    <Select compact {...register(`items.${idx}.product_id`)}>
                      <option value={0}>Select SKU...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (Current On-Hand: {p.total_on_hand})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-ink-secondary mb-1">
                      New Physical Qty
                    </label>
                    <Input
                      compact
                      type="number"
                      min={0}
                      className="tabular-nums"
                      {...register(`items.${idx}.adjusted_quantity`)}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end pt-4">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="p-1 rounded text-ink-secondary hover:text-status-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasPermission('adjustments.approve') && (
            <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" {...register('approve_immediately')} />
              <span>Approve and apply to inventory ledger immediately</span>
            </label>
          )}
        </form>
      </Modal>

      {/* Review / Approve / Reject Modal */}
      <Modal
        open={activeAdjustment !== null}
        onClose={() => setActiveAdjustment(null)}
        title={activeAdjustment ? `Adjustment ${activeAdjustment.adjustment_number}` : 'Adjustment'}
        description={
          activeAdjustment
            ? `${activeAdjustment.warehouse?.code} · ${reasonLabels[activeAdjustment.reason] ?? activeAdjustment.reason}`
            : undefined
        }
        size="lg"
        footer={
          activeAdjustment && (
            <div className="w-full flex items-center justify-between">
              <StatusBadge status={activeAdjustment.status} />
              {activeAdjustment.status === 'pending' && hasPermission('adjustments.approve') && (
                <div className="flex items-center gap-2">
                  {!showRejectInput ? (
                    <>
                      <Button
                        variant="danger-outline"
                        size="sm"
                        leftIcon={<XCircle className="w-3.5 h-3.5" />}
                        onClick={() => setShowRejectInput(true)}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={approveMutation.isPending}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        onClick={() => approveMutation.mutate(activeAdjustment.id)}
                      >
                        Approve & Post Variance
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowRejectInput(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={rejectionReason.trim().length < 3}
                        loading={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate(activeAdjustment.id)}
                      >
                        Confirm Rejection
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        }
      >
        {activeAdjustment && (
          <div className="space-y-4">
            <div className="p-3 rounded bg-canvas border border-line text-xs space-y-1">
              <div className="font-semibold text-ink">Audit Explanation:</div>
              <p className="text-ink-secondary">{activeAdjustment.notes}</p>
              {activeAdjustment.rejection_reason && (
                <p className="text-status-danger pt-1">
                  <strong>Rejection Reason:</strong> {activeAdjustment.rejection_reason}
                </p>
              )}
            </div>

            {showRejectInput && (
              <FormField label="Reason for Rejection" required>
                <Input
                  placeholder="Explain why this adjustment request is rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </FormField>
            )}

            <div className="border border-line rounded-md overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-canvas border-b border-line text-[11px] font-semibold uppercase text-ink-secondary">
                  <tr>
                    <th className="px-3.5 py-2">SKU / Product</th>
                    <th className="px-3.5 py-2 text-right">System Qty</th>
                    <th className="px-3.5 py-2 text-right">Counted Qty</th>
                    <th className="px-3.5 py-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(activeAdjustment.items ?? []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-3.5 py-2">
                        <div className="font-mono text-xs font-semibold text-ink">
                          {it.product?.sku}
                        </div>
                        <div className="text-xs text-ink-secondary">{it.product?.name}</div>
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums text-ink-secondary">
                        {formatNumber(it.previous_quantity)}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums font-semibold text-ink">
                        {formatNumber(it.adjusted_quantity)}
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right tabular-nums font-semibold ${
                          it.difference_quantity > 0
                            ? 'text-status-success'
                            : it.difference_quantity < 0
                              ? 'text-status-danger'
                              : 'text-ink-secondary'
                        }`}
                      >
                        {formatSignedQuantity(it.difference_quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
