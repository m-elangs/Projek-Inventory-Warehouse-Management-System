import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, CheckCircle2, XCircle, PackageCheck, Trash2, ClipboardList } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Product, PurchaseOrder, Supplier, Warehouse } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/FormControls';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';

const poSchema = z.object({
  supplier_id: z.coerce.number().min(1, 'Select supplier'),
  warehouse_id: z.coerce.number().min(1, 'Select delivery warehouse'),
  order_date: z.string().min(1, 'Order date required'),
  expected_delivery_date: z.string().optional(),
  status: z.enum(['draft', 'approved']).default('draft'),
  tax_amount: z.coerce.number().min(0).default(0),
  discount_amount: z.coerce.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        product_id: z.coerce.number().min(1, 'Select SKU'),
        ordered_quantity: z.coerce.number().int().min(1, 'Min 1'),
        unit_price: z.coerce.number().min(0, 'Min 0'),
      })
    )
    .min(1, 'Add at least one item'),
});

type PoFormValues = z.infer<typeof poSchema>;

export function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [activePoId, setActivePoId] = useState<number | null>(null);
  const [receiveMode, setReceiveMode] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);

  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryNote, setDeliveryNote] = useState('');
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

  const params = {
    warehouse_id: selectedWarehouseId,
    search: debouncedSearch,
    status: statusFilter || undefined,
    page,
    per_page: 15,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.purchaseOrders(params),
    queryFn: () => apiClient.getPaginated<PurchaseOrder>('/purchase-orders', params),
  });

  const { data: activePo } = useQuery({
    queryKey: queryKeys.purchaseOrderDetail(activePoId),
    queryFn: () => apiClient.get<PurchaseOrder>(`/purchase-orders/${activePoId}`),
    enabled: activePoId !== null,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: queryKeys.suppliers({ all: true, active_only: true }),
    queryFn: () => apiClient.get<Supplier[]>('/suppliers', { all: true, active_only: true }),
    enabled: createOpen,
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
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PoFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      supplier_id: 0,
      warehouse_id: selectedWarehouseId ?? 0,
      order_date: today,
      expected_delivery_date: '',
      status: 'draft',
      tax_amount: 0,
      discount_amount: 0,
      notes: '',
      items: [{ product_id: 0, ordered_quantity: 10, unit_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const watchedItems = watch('items');
  const watchedTax = Number(watch('tax_amount') || 0);
  const watchedDiscount = Number(watch('discount_amount') || 0);

  const computedSubtotal = watchedItems.reduce(
    (acc, it) => acc + Number(it.ordered_quantity || 0) * Number(it.unit_price || 0),
    0
  );
  const computedTotal = Math.max(0, computedSubtotal + watchedTax - watchedDiscount);

  const createMutation = useMutation({
    mutationFn: (values: PoFormValues) =>
      apiClient.post<PurchaseOrder>('/purchase-orders', {
        ...values,
        expected_delivery_date: values.expected_delivery_date || null,
      }),
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({ type: 'success', title: `Purchase Order ${po.po_number} created` });
      setCreateOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Failed to create PO',
        description: err instanceof ApiError ? err.message : 'Check line items.',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/purchase-orders/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrderDetail(activePoId) });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({ type: 'success', title: 'Purchase Order approved for receiving' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/purchase-orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrderDetail(activePoId) });
      setCancelTarget(null);
      pushToast({ type: 'success', title: 'Purchase Order cancelled' });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Cannot cancel PO',
        description: err instanceof ApiError ? err.message : 'Action rejected.',
      });
      setCancelTarget(null);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: () => {
      const items = (activePo?.items ?? [])
        .map((item) => ({
          purchase_order_item_id: item.id,
          quantity_received: Number(receiveQuantities[item.id] ?? 0),
        }))
        .filter((it) => it.quantity_received > 0);

      return apiClient.post(`/purchase-orders/${activePo?.id}/receive`, {
        receipt_date: receiptDate,
        supplier_delivery_note: deliveryNote || null,
        items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrderDetail(activePoId) });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setReceiveMode(false);
      setDeliveryNote('');
      pushToast({
        type: 'success',
        title: 'Goods Receipt posted',
        description: 'Received quantities added to warehouse inventory and movement ledger.',
      });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Receiving error',
        description: err instanceof ApiError ? err.message : 'Failed to post receipt.',
      });
    },
  });

  const openReceiveView = (po: PurchaseOrder) => {
    const initial: Record<number, number> = {};
    (po.items ?? []).forEach((it) => {
      initial[it.id] = Math.max(0, it.ordered_quantity - it.received_quantity);
    });
    setReceiveQuantities(initial);
    setReceiveMode(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Manage supplier procurement orders, approvals, partial deliveries, and warehouse goods receipts."
        actions={
          hasPermission('purchase_orders.create') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                reset({
                  supplier_id: suppliers[0]?.id ?? 0,
                  warehouse_id: selectedWarehouseId || warehouses[0]?.id || 0,
                  order_date: today,
                  expected_delivery_date: '',
                  status: hasPermission('purchase_orders.approve') ? 'approved' : 'draft',
                  tax_amount: 0,
                  discount_amount: 0,
                  notes: '',
                  items: [{ product_id: 0, ordered_quantity: 10, unit_price: 0 }],
                });
                setCreateOpen(true);
              }}
            >
              Create Purchase Order
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
              placeholder="Search PO number or supplier..."
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
            className="w-[220px]"
          >
            <option value="">All Order Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved (Open)</option>
            <option value="partially_received">Partially Received</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">PO Number</th>
                <th className="px-3.5 py-2.5">Supplier</th>
                <th className="px-3.5 py-2.5">Warehouse</th>
                <th className="px-3.5 py-2.5">Order Date</th>
                <th className="px-3.5 py-2.5">Receiving Progress</th>
                <th className="px-3.5 py-2.5 text-right">Total Amount</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={6} columns={8} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<ClipboardList className="w-5 h-5" />}
                      title="No purchase orders found"
                      description="Create a purchase order to track vendor commitments and inbound receiving."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((po) => {
                  const ordered = Number(po.total_ordered_qty ?? 0);
                  const received = Number(po.total_received_qty ?? 0);
                  const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;

                  return (
                    <tr key={po.id} className="hover:bg-canvas/60">
                      <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-brand">
                        <button
                          type="button"
                          onClick={() => {
                            setReceiveMode(false);
                            setActivePoId(po.id);
                          }}
                          className="hover:underline"
                        >
                          {po.po_number}
                        </button>
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-ink">
                        {po.supplier?.company_name}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-xs text-ink-secondary">
                        {po.warehouse?.code}
                      </td>
                      <td className="px-3.5 py-2.5 tabular-nums text-ink-secondary">
                        {formatDate(po.order_date)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-canvas border border-line rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-status-success"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-ink-secondary">
                            {formatNumber(received)} / {formatNumber(ordered)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-ink">
                        {formatCurrency(po.total_amount)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <StatusBadge status={po.status} />
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setReceiveMode(false);
                            setActivePoId(po.id);
                          }}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Create Purchase Order Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Purchase Order"
        description="Specify supplier, target warehouse, and ordered SKU quantities."
        size="xl"
        footer={
          <div className="w-full flex items-center justify-between">
            <div className="text-sm tabular-nums">
              <span className="text-ink-secondary mr-2">Order Total:</span>
              <span className="font-semibold text-ink text-[15px]">
                {formatCurrency(computedTotal)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={createMutation.isPending}
                onClick={handleSubmit((v) => createMutation.mutate(v))}
              >
                Submit Purchase Order
              </Button>
            </div>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2">
              <FormField label="Supplier" required error={errors.supplier_id?.message}>
                <Select {...register('supplier_id')}>
                  <option value={0}>Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.company_name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField label="Delivery Warehouse" required error={errors.warehouse_id?.message}>
                <Select {...register('warehouse_id')}>
                  <option value={0}>Select warehouse...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormField label="Order Date" required error={errors.order_date?.message}>
              <Input type="date" {...register('order_date')} />
            </FormField>

            <FormField label="Expected Delivery">
              <Input type="date" {...register('expected_delivery_date')} />
            </FormField>

            <FormField label="Tax Amount (Rp)">
              <Input type="number" step="1" min={0} className="tabular-nums" {...register('tax_amount')} />
            </FormField>

            <FormField label="Discount (Rp)">
              <Input type="number" step="1" min={0} className="tabular-nums" {...register('discount_amount')} />
            </FormField>
          </div>

          <div className="border border-line rounded-md overflow-hidden">
            <div className="px-3.5 py-2 bg-canvas border-b border-line flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Order Line Items
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => append({ product_id: 0, ordered_quantity: 10, unit_price: 0 })}
              >
                Add Product
              </Button>
            </div>

            <div className="divide-y divide-line">
              {fields.map((field, idx) => {
                const lineQty = Number(watchedItems[idx]?.ordered_quantity || 0);
                const linePrice = Number(watchedItems[idx]?.unit_price || 0);
                return (
                  <div key={field.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-6">
                      <Select
                        compact
                        {...register(`items.${idx}.product_id`, {
                          onChange: (e) => {
                            const prod = products.find((p) => p.id === Number(e.target.value));
                            if (prod) {
                              setValue(`items.${idx}.unit_price`, prod.unit_cost);
                            }
                          },
                        })}
                      >
                        <option value={0}>Select product SKU...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        compact
                        type="number"
                        min={1}
                        placeholder="Qty"
                        className="tabular-nums"
                        {...register(`items.${idx}.ordered_quantity`)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        compact
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Unit Price"
                        className="tabular-nums"
                        {...register(`items.${idx}.unit_price`)}
                      />
                    </div>
                    <div className="sm:col-span-1 text-right text-xs font-semibold tabular-nums text-ink">
                      {formatCurrency(lineQty * linePrice)}
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
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="Initial Status">
              <Select {...register('status')}>
                <option value="draft">Save as Draft</option>
                {hasPermission('purchase_orders.approve') && (
                  <option value="approved">Approve Immediately</option>
                )}
              </Select>
            </FormField>
            <FormField label="Procurement Notes">
              <Textarea rows={1} placeholder="Delivery instructions or payment terms..." {...register('notes')} />
            </FormField>
          </div>
        </form>
      </Modal>

      {/* Inspect / Approve / Receive Purchase Order Modal */}
      <Modal
        open={activePoId !== null}
        onClose={() => {
          setActivePoId(null);
          setReceiveMode(false);
        }}
        title={activePo ? `Purchase Order ${activePo.po_number}` : 'Purchase Order'}
        description={
          activePo
            ? `${activePo.supplier?.company_name} → ${activePo.warehouse?.code} (${activePo.warehouse?.name})`
            : undefined
        }
        size="xl"
        footer={
          activePo && (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={activePo.status} />
                <span className="text-xs text-ink-secondary tabular-nums">
                  Total: <strong className="text-ink">{formatCurrency(activePo.total_amount)}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {activePo.status === 'draft' && hasPermission('purchase_orders.approve') && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={approveMutation.isPending}
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    onClick={() => approveMutation.mutate(activePo.id)}
                  >
                    Approve Order
                  </Button>
                )}

                {['draft', 'approved'].includes(activePo.status) &&
                  hasPermission('purchase_orders.cancel') && (
                    <Button
                      variant="danger-outline"
                      size="sm"
                      leftIcon={<XCircle className="w-3.5 h-3.5" />}
                      onClick={() => setCancelTarget(activePo)}
                    >
                      Cancel PO
                    </Button>
                  )}

                {['approved', 'partially_received'].includes(activePo.status) &&
                  hasPermission('purchase_orders.receive') &&
                  !receiveMode && (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<PackageCheck className="w-3.5 h-3.5" />}
                      onClick={() => openReceiveView(activePo)}
                    >
                      Receive Goods into Stock
                    </Button>
                  )}

                {receiveMode && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setReceiveMode(false)}>
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={receiveMutation.isPending}
                      onClick={() => receiveMutation.mutate()}
                    >
                      Post Goods Receipt
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        }
      >
        {activePo && (
          <div className="space-y-4">
            {receiveMode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-brand-subtle/60 border border-brand-muted p-3.5 rounded-md">
                <FormField label="Receipt Date" required>
                  <Input
                    compact
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Supplier Delivery Note / Packing Slip">
                  <Input
                    compact
                    placeholder="e.g. DO-2026-8821"
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                  />
                </FormField>
              </div>
            )}

            <div className="border border-line rounded-md overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-canvas border-b border-line text-[11px] font-semibold uppercase text-ink-secondary">
                  <tr>
                    <th className="px-3.5 py-2">SKU / Product</th>
                    <th className="px-3.5 py-2 text-right">Ordered</th>
                    <th className="px-3.5 py-2 text-right">Received</th>
                    <th className="px-3.5 py-2 text-right">Remaining</th>
                    <th className="px-3.5 py-2 text-right">Unit Price</th>
                    {receiveMode ? (
                      <th className="px-3.5 py-2 text-right w-32">Receive Now</th>
                    ) : (
                      <th className="px-3.5 py-2 text-right">Line Total</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(activePo.items ?? []).map((item) => {
                    const remaining = Math.max(0, item.ordered_quantity - item.received_quantity);
                    return (
                      <tr key={item.id}>
                        <td className="px-3.5 py-2.5">
                          <div className="font-mono text-xs font-semibold text-ink">
                            {item.product?.sku}
                          </div>
                          <div className="text-xs text-ink-secondary">{item.product?.name}</div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">
                          {formatNumber(item.ordered_quantity)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-status-success font-medium">
                          {formatNumber(item.received_quantity)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums font-medium">
                          {formatNumber(remaining)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">
                          {formatCurrency(item.unit_price)}
                        </td>
                        {receiveMode ? (
                          <td className="px-3.5 py-2 text-right">
                            <Input
                              compact
                              type="number"
                              min={0}
                              max={remaining}
                              disabled={remaining === 0}
                              value={receiveQuantities[item.id] ?? 0}
                              onChange={(e) =>
                                setReceiveQuantities((prev) => ({
                                  ...prev,
                                  [item.id]: Math.max(0, Math.min(remaining, Number(e.target.value))),
                                }))
                              }
                              className="text-right tabular-nums"
                            />
                          </td>
                        ) : (
                          <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold">
                            {formatCurrency(item.line_total)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(activePo.receipts?.length ?? 0) > 0 && !receiveMode && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">
                  Goods Receipt History
                </h3>
                <div className="border border-line rounded-md divide-y divide-line text-xs">
                  {activePo.receipts?.map((grn) => (
                    <div key={grn.id} className="px-3.5 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold text-ink mr-2">
                          {grn.receipt_number}
                        </span>
                        <span className="text-ink-secondary">
                          Received by {grn.receiver?.name} on {formatDate(grn.receipt_date)}
                        </span>
                      </div>
                      {grn.supplier_delivery_note && (
                        <span className="font-mono text-ink-secondary">
                          Ref: {grn.supplier_delivery_note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        loading={cancelMutation.isPending}
        title="Cancel Purchase Order"
        description={`Cancel ${cancelTarget?.po_number}? Cancelled orders cannot receive inventory.`}
        confirmLabel="Cancel Order"
      />
    </div>
  );
}
