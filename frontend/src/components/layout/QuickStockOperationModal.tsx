import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useToastStore } from '@/stores/toastStore';
import { useUiStore } from '@/stores/uiStore';
import type { Product, Supplier, Warehouse } from '@/types/domain';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormControls';

const stockOpSchema = z.object({
  warehouse_id: z.coerce.number().min(1, 'Select a warehouse'),
  warehouse_location_id: z.string().optional(),
  supplier_id: z.string().optional(),
  transaction_date: z.string().min(1, 'Date is required'),
  reference_number: z.string().max(50).optional(),
  destination: z.string().optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        product_id: z.coerce.number().min(1, 'Select a product'),
        quantity: z.coerce.number().int().min(1, 'Min 1'),
        unit_cost: z.coerce.number().min(0).optional(),
      })
    )
    .min(1, 'Add at least one line item'),
});

type StockOpFormValues = z.infer<typeof stockOpSchema>;

export function QuickStockOperationModal({
  mode,
  onClose,
}: {
  mode: 'in' | 'out' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.pushToast);
  const selectedWarehouseId = useUiStore((s) => s.selectedWarehouseId);

  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses({ active_only: true }),
    queryFn: () => apiClient.get<Warehouse[]>('/warehouses', { active_only: true }),
    enabled: mode !== null,
  });

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.products({ all: true, is_active: true }),
    queryFn: () => apiClient.get<Product[]>('/products', { all: true, is_active: true }),
    enabled: mode !== null,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: queryKeys.suppliers({ all: true, active_only: true }),
    queryFn: () => apiClient.get<Supplier[]>('/suppliers', { all: true, active_only: true }),
    enabled: mode === 'in',
  });

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<StockOpFormValues>({
    resolver: zodResolver(stockOpSchema),
    defaultValues: {
      warehouse_id: selectedWarehouseId ?? 0,
      warehouse_location_id: '',
      supplier_id: '',
      transaction_date: today,
      reference_number: '',
      destination: '',
      notes: '',
      items: [{ product_id: 0, quantity: 1, unit_cost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (mode) {
      reset({
        warehouse_id: selectedWarehouseId || warehouses[0]?.id || 0,
        warehouse_location_id: '',
        supplier_id: '',
        transaction_date: today,
        reference_number: '',
        destination: '',
        notes: '',
        items: [{ product_id: 0, quantity: 1, unit_cost: 0 }],
      });
    }
  }, [mode, selectedWarehouseId, warehouses, reset, today]);

  const watchedWarehouseId = Number(watch('warehouse_id'));
  const activeWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);
  const locations = activeWarehouse?.locations?.filter((l) => l.is_active) ?? [];

  const mutation = useMutation({
    mutationFn: async (values: StockOpFormValues) => {
      if (mode === 'out' && (!values.destination || values.destination.trim().length < 2)) {
        throw new ApiError('Destination or reference recipient is required for Stock Out.', 422, {
          destination: ['Enter customer, department, or dispatch destination.'],
        });
      }

      const payload = {
        warehouse_id: values.warehouse_id,
        warehouse_location_id: values.warehouse_location_id ? Number(values.warehouse_location_id) : null,
        supplier_id: values.supplier_id ? Number(values.supplier_id) : null,
        transaction_date: values.transaction_date,
        reference_number: values.reference_number?.trim() || null,
        destination: values.destination?.trim() || null,
        notes: values.notes?.trim() || null,
        items: values.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_cost: mode === 'in' ? Number(it.unit_cost ?? 0) : undefined,
        })),
      };

      return mode === 'in'
        ? apiClient.post('/inventory/stock-in', payload)
        : apiClient.post('/inventory/stock-out', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        type: 'success',
        title: mode === 'in' ? 'Stock In recorded' : 'Stock Out dispatched',
        description: 'Inventory balances and immutable movement ledger have been updated.',
      });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        Object.entries(err.fieldErrors).forEach(([field, msgs]) => {
          setError(field as keyof StockOpFormValues, { message: msgs[0] });
        });
        pushToast({ type: 'error', title: 'Transaction rejected', description: err.message });
      } else {
        pushToast({ type: 'error', title: 'Unexpected error', description: 'Please retry.' });
      }
    },
  });

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      size="lg"
      title={mode === 'in' ? 'Record Stock In' : 'Record Stock Out'}
      description={
        mode === 'in'
          ? 'Receive incoming inventory directly into a warehouse and generate ledger records.'
          : 'Deduct outgoing inventory with real-time available stock validation.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((vals) => mutation.mutate(vals))}
          >
            {mode === 'in' ? 'Post Stock In' : 'Confirm Stock Out'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField label="Warehouse" required error={errors.warehouse_id?.message}>
            <Select {...register('warehouse_id')} hasError={!!errors.warehouse_id}>
              <option value={0}>Select warehouse...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Storage Bin / Location" hint="Optional internal zone or rack">
            <Select {...register('warehouse_location_id')}>
              <option value="">Unassigned (Warehouse Level)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Transaction Date" required error={errors.transaction_date?.message}>
            <Input type="date" {...register('transaction_date')} hasError={!!errors.transaction_date} />
          </FormField>

          <FormField label="Reference Number" hint="Auto-generated if left blank">
            <Input
              placeholder={mode === 'in' ? 'e.g. GRN-MANUAL-01' : 'e.g. SO-2026-4910'}
              {...register('reference_number')}
            />
          </FormField>

          {mode === 'in' ? (
            <FormField label="Supplier" hint="Optional vendor attribution">
              <Select {...register('supplier_id')}>
                <option value="">No supplier / Internal load</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.company_name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <FormField
              label="Destination / Recipient"
              required
              error={errors.destination?.message}
            >
              <Input
                placeholder="Customer name, order ref, or department"
                {...register('destination')}
                hasError={!!errors.destination}
              />
            </FormField>
          )}

          <FormField label="Operational Notes">
            <Input placeholder="Optional remarks for audit log..." {...register('notes')} />
          </FormField>
        </div>

        <div className="border border-line rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 bg-canvas border-b border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Line Items
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ product_id: 0, quantity: 1, unit_cost: 0 })}
            >
              Add Line
            </Button>
          </div>

          <div className="divide-y divide-line">
            {fields.map((field, idx) => {
              const selectedProdId = Number(watch(`items.${idx}.product_id`));
              const selectedProd = products.find((p) => p.id === selectedProdId);

              return (
                <div key={field.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
                  <div className={mode === 'in' ? 'sm:col-span-6' : 'sm:col-span-8'}>
                    <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                      Product
                    </label>
                    <Select
                      compact
                      {...register(`items.${idx}.product_id`, {
                        onChange: (e) => {
                          const prod = products.find((p) => p.id === Number(e.target.value));
                          if (prod && mode === 'in') {
                            const costInput = document.querySelector<HTMLInputElement>(
                              `input[name="items.${idx}.unit_cost"]`
                            );
                            if (costInput) costInput.value = String(prod.unit_cost);
                          }
                        },
                      })}
                      hasError={!!errors.items?.[idx]?.product_id}
                    >
                      <option value={0}>Select SKU...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (Avail: {p.available_quantity} {p.unit_of_measure})
                        </option>
                      ))}
                    </Select>
                    {errors.items?.[idx]?.product_id && (
                      <p className="text-xs text-status-danger mt-0.5">
                        {errors.items[idx]?.product_id?.message}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                      Quantity {selectedProd ? `(${selectedProd.unit_of_measure})` : ''}
                    </label>
                    <Input
                      compact
                      type="number"
                      min={1}
                      className="tabular-nums"
                      {...register(`items.${idx}.quantity`)}
                      hasError={!!errors.items?.[idx]?.quantity}
                    />
                    {errors.items?.[idx]?.quantity && (
                      <p className="text-xs text-status-danger mt-0.5">
                        {errors.items[idx]?.quantity?.message}
                      </p>
                    )}
                  </div>

                  {mode === 'in' && (
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                        Unit Cost (Rp)
                      </label>
                      <Input
                        compact
                        type="number"
                        step="0.01"
                        min={0}
                        className="tabular-nums"
                        {...register(`items.${idx}.unit_cost`)}
                      />
                    </div>
                  )}

                  <div className="sm:col-span-1 flex sm:justify-end pt-5">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="p-1.5 rounded text-ink-secondary hover:text-status-danger hover:bg-status-danger-bg"
                        aria-label="Remove line"
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
      </form>
    </Modal>
  );
}
