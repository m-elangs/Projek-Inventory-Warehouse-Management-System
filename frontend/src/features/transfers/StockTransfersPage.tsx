import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck, CheckCircle2, XCircle, Trash2, ArrowRight } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatDate, formatNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Product, StockTransfer, Warehouse } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/FormControls';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';

const transferSchema = z
  .object({
    source_warehouse_id: z.coerce.number().min(1, 'Select source warehouse'),
    destination_warehouse_id: z.coerce.number().min(1, 'Select destination warehouse'),
    transfer_date: z.string().min(1, 'Date is required'),
    notes: z.string().max(1000).optional(),
    complete_immediately: z.boolean().default(false),
    items: z
      .array(
        z.object({
          product_id: z.coerce.number().min(1, 'Select SKU'),
          quantity: z.coerce.number().int().min(1, 'Min 1'),
        })
      )
      .min(1, 'Add at least one product'),
  })
  .refine((d) => d.source_warehouse_id !== d.destination_warehouse_id, {
    message: 'Destination warehouse must differ from source warehouse',
    path: ['destination_warehouse_id'],
  });

type TransferFormValues = z.infer<typeof transferSchema>;

export function StockTransfersPage() {
  const queryClient = useQueryClient();
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<StockTransfer | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockTransfer | null>(null);

  const params = {
    warehouse_id: selectedWarehouseId,
    search: debouncedSearch,
    status: statusFilter || undefined,
    page,
    per_page: 15,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.transfers(params),
    queryFn: () => apiClient.getPaginated<StockTransfer>('/stock-transfers', params),
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
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      source_warehouse_id: selectedWarehouseId ?? 0,
      destination_warehouse_id: 0,
      transfer_date: today,
      notes: '',
      complete_immediately: false,
      items: [{ product_id: 0, quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (values: TransferFormValues) =>
      apiClient.post<StockTransfer>('/stock-transfers', values),
    onSuccess: (trf) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        type: 'success',
        title: `Transfer ${trf.transfer_number} created`,
        description:
          trf.status === 'completed'
            ? 'Stock transferred atomically between warehouses.'
            : 'Source stock reserved pending receiving confirmation.',
      });
      setCreateOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Transfer failed',
        description: err instanceof ApiError ? err.message : 'Unable to reserve stock.',
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiClient.post<StockTransfer>(`/stock-transfers/${id}/complete`),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setActiveTransfer(updated);
      pushToast({
        type: 'success',
        title: 'Transfer completed',
        description: 'Source stock deducted and destination warehouse credited.',
      });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Cannot complete transfer',
        description: err instanceof ApiError ? err.message : 'Operation failed.',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.post<StockTransfer>(`/stock-transfers/${id}/cancel`),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setCancelTarget(null);
      setActiveTransfer(updated);
      pushToast({
        type: 'success',
        title: 'Transfer cancelled',
        description: 'Reserved stock at source warehouse has been released.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inter-Warehouse Stock Transfers"
        description="Coordinate controlled stock rebalancing with source stock reservation and atomic ledger execution."
        actions={
          hasPermission('transfers.create') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                reset({
                  source_warehouse_id: selectedWarehouseId ?? 0,
                  destination_warehouse_id: 0,
                  transfer_date: today,
                  notes: '',
                  complete_immediately: false,
                  items: [{ product_id: 0, quantity: 1 }],
                });
                setCreateOpen(true);
              }}
            >
              New Stock Transfer
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
              placeholder="Search transfer number..."
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
            <option value="pending">Pending (In Transit)</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">Transfer #</th>
                <th className="px-3.5 py-2.5">Route</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5 text-right">Total Units</th>
                <th className="px-3.5 py-2.5">Requested By</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Action</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Truck className="w-5 h-5" />}
                      title="No stock transfers recorded"
                      description="Move inventory safely between regional warehouses with automatic stock reservation."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((trf) => (
                  <tr key={trf.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-brand">
                      <button
                        type="button"
                        onClick={() => setActiveTransfer(trf)}
                        className="hover:underline"
                      >
                        {trf.transfer_number}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono font-semibold text-ink">
                          {trf.source_warehouse?.code}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-ink-muted" />
                        <span className="font-mono font-semibold text-ink">
                          {trf.destination_warehouse?.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-secondary">
                        {trf.source_warehouse?.name} → {trf.destination_warehouse?.name}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 tabular-nums text-ink-secondary">
                      {formatDate(trf.transfer_date)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-ink">
                      {formatNumber(trf.total_quantity)}
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">
                      {trf.requester?.name ?? '—'}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={trf.status} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTransfer(trf)}
                      >
                        {trf.status === 'pending' ? 'Process' : 'Details'}
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

      {/* Create Transfer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Initiate Stock Transfer"
        description="Available stock at the source warehouse will be reserved immediately."
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
              Create Transfer
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <FormField label="Source Warehouse" required error={errors.source_warehouse_id?.message}>
              <Select {...register('source_warehouse_id')}>
                <option value={0}>Select source...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Destination Warehouse"
              required
              error={errors.destination_warehouse_id?.message}
            >
              <Select {...register('destination_warehouse_id')}>
                <option value={0}>Select destination...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Transfer Date" required error={errors.transfer_date?.message}>
              <Input type="date" {...register('transfer_date')} />
            </FormField>
          </div>

          <div className="border border-line rounded-md overflow-hidden">
            <div className="px-3.5 py-2 bg-canvas border-b border-line flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Products to Transfer
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => append({ product_id: 0, quantity: 1 })}
              >
                Add Item
              </Button>
            </div>
            <div className="divide-y divide-line">
              {fields.map((field, idx) => (
                <div key={field.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-8">
                    <Select compact {...register(`items.${idx}.product_id`)}>
                      <option value={0}>Select SKU...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (Global Avail: {p.available_quantity})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      compact
                      type="number"
                      min={1}
                      className="tabular-nums"
                      {...register(`items.${idx}.quantity`)}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
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

          <FormField label="Dispatch Notes">
            <Textarea rows={2} placeholder="Carrier, seal number, or reason..." {...register('notes')} />
          </FormField>

          {hasPermission('transfers.complete') && (
            <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" {...register('complete_immediately')} />
              <span>Complete transfer immediately (post source & destination ledger movements now)</span>
            </label>
          )}
        </form>
      </Modal>

      {/* Transfer Inspection & Action Modal */}
      <Modal
        open={activeTransfer !== null}
        onClose={() => setActiveTransfer(null)}
        title={activeTransfer ? `Transfer ${activeTransfer.transfer_number}` : 'Transfer'}
        description={
          activeTransfer
            ? `${activeTransfer.source_warehouse?.code} → ${activeTransfer.destination_warehouse?.code}`
            : undefined
        }
        size="lg"
        footer={
          activeTransfer && (
            <div className="w-full flex items-center justify-between">
              <StatusBadge status={activeTransfer.status} />
              <div className="flex items-center gap-2">
                {activeTransfer.status === 'pending' && hasPermission('transfers.cancel') && (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    leftIcon={<XCircle className="w-3.5 h-3.5" />}
                    onClick={() => setCancelTarget(activeTransfer)}
                  >
                    Cancel & Release Reserve
                  </Button>
                )}
                {activeTransfer.status === 'pending' && hasPermission('transfers.complete') && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={completeMutation.isPending}
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    onClick={() => completeMutation.mutate(activeTransfer.id)}
                  >
                    Complete Receipt at Destination
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {activeTransfer && (
          <div className="space-y-4">
            {activeTransfer.notes && (
              <p className="text-xs text-ink-secondary bg-canvas p-3 rounded border border-line">
                {activeTransfer.notes}
              </p>
            )}

            <div className="border border-line rounded-md overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-canvas border-b border-line text-[11px] font-semibold uppercase text-ink-secondary">
                  <tr>
                    <th className="px-3.5 py-2">SKU</th>
                    <th className="px-3.5 py-2">Product</th>
                    <th className="px-3.5 py-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(activeTransfer.items ?? []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-3.5 py-2 font-mono text-xs font-semibold text-ink">
                        {it.product?.sku}
                      </td>
                      <td className="px-3.5 py-2 text-ink">{it.product?.name}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums font-semibold">
                        {formatNumber(it.quantity)} {it.product?.unit_of_measure}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        loading={cancelMutation.isPending}
        title="Cancel Pending Transfer"
        description={`Cancel ${cancelTarget?.transfer_number}? Reserved units at the source warehouse will be returned to available inventory.`}
        confirmLabel="Cancel Transfer"
      />
    </div>
  );
}
