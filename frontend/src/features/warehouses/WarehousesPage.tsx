import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, Edit2, Warehouse as WarehouseIcon, Layers, Boxes } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { EmployeeRecord, Warehouse } from '@/types/domain';
import { EmptyState, PageHeader } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/FormControls';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';

const warehouseSchema = z.object({
  code: z.string().min(2, 'Code is required').max(30),
  name: z.string().min(2, 'Name is required').max(150),
  address: z.string().min(5, 'Address is required').max(1000),
  city: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  manager_id: z.string().optional(),
  is_active: z.boolean().default(true),
});

type WarehouseForm = z.infer<typeof warehouseSchema>;

export function WarehousesPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [locationsTarget, setLocationsTarget] = useState<Warehouse | null>(null);
  const [inspectWarehouseId, setInspectWarehouseId] = useState<number | null>(null);

  const [locCode, setLocCode] = useState('');
  const [locName, setLocName] = useState('');
  const [locZone, setLocZone] = useState('');
  const [locType, setLocType] = useState<'receiving' | 'storage' | 'picking' | 'staging' | 'returns'>('storage');

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: queryKeys.warehouses(),
    queryFn: () => apiClient.get<Warehouse[]>('/warehouses'),
  });

  const { data: warehouseDetail } = useQuery({
    queryKey: queryKeys.warehouseDetail(inspectWarehouseId),
    queryFn: () =>
      apiClient.get<
        Warehouse & {
          stocks?: Array<{
            id: number;
            quantity_on_hand: number;
            reserved_quantity: number;
            available_quantity: number;
            product?: { sku: string; name: string; unit_of_measure: string };
            location?: { code: string } | null;
          }>;
        }
      >(`/warehouses/${inspectWarehouseId}`),
    enabled: inspectWarehouseId !== null,
  });

  const { data: usersPage } = useQuery({
    queryKey: queryKeys.users({ per_page: 100 }),
    queryFn: () => apiClient.getPaginated<EmployeeRecord>('/admin/users', { per_page: 100 }),
    enabled: hasPermission('users.manage') && modalOpen,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseForm>({
    resolver: zodResolver(warehouseSchema),
  });

  const openCreate = () => {
    setEditingWarehouse(null);
    reset({
      code: '',
      name: '',
      address: '',
      city: '',
      phone: '',
      manager_id: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    reset({
      code: wh.code,
      name: wh.name,
      address: wh.address,
      city: wh.city ?? '',
      phone: wh.phone ?? '',
      manager_id: wh.manager_id ? String(wh.manager_id) : '',
      is_active: wh.is_active,
    });
    setModalOpen(true);
  };

  const saveWarehouseMutation = useMutation({
    mutationFn: (values: WarehouseForm) => {
      const payload = {
        ...values,
        manager_id: values.manager_id ? Number(values.manager_id) : null,
      };
      return editingWarehouse
        ? apiClient.put(`/warehouses/${editingWarehouse.id}`, payload)
        : apiClient.post('/warehouses', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        type: 'success',
        title: editingWarehouse ? 'Warehouse updated' : 'Warehouse created',
      });
      setModalOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Check input fields.',
      });
    },
  });

  const addLocationMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/warehouses/${locationsTarget?.id}/locations`, {
        code: locCode,
        name: locName,
        zone: locZone || null,
        location_type: locType,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      const updatedList = await apiClient.get<Warehouse[]>('/warehouses');
      const refreshed = updatedList.find((w) => w.id === locationsTarget?.id) ?? null;
      setLocationsTarget(refreshed);
      setLocCode('');
      setLocName('');
      setLocZone('');
      pushToast({ type: 'success', title: 'Storage bin added' });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Failed to add location',
        description: err instanceof ApiError ? err.message : 'Duplicate location code.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses & Storage Locations"
        description="Configure distribution facilities, assigned managers, and internal storage bin topologies."
        actions={
          hasPermission('warehouses.create') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={openCreate}
            >
              Add Warehouse
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-48 bg-surface border border-line rounded-lg animate-pulse" />
          ))}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg">
          <EmptyState
            icon={<WarehouseIcon className="w-5 h-5" />}
            title="No accessible warehouses"
            description="Contact an administrator to assign your account to an active warehouse."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {warehouses.map((wh) => (
            <div
              key={wh.id}
              className="bg-surface border border-line rounded-lg shadow-panel flex flex-col justify-between"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-brand-subtle text-brand border border-brand-muted">
                        {wh.code}
                      </span>
                      <StatusBadge status={wh.is_active ? 'active' : 'inactive'} />
                    </div>
                    <h2 className="text-[15px] font-semibold text-ink mt-2">{wh.name}</h2>
                  </div>

                  {hasPermission('warehouses.update') && (
                    <button
                      type="button"
                      onClick={() => openEdit(wh)}
                      className="p-1.5 rounded text-ink-secondary hover:text-ink hover:bg-canvas"
                      title="Edit facility"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-start gap-1.5 text-xs text-ink-secondary">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-muted" />
                  <span>
                    {wh.address}
                    {wh.city ? `, ${wh.city}` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line text-xs">
                  <div>
                    <div className="text-ink-secondary">Units On Hand</div>
                    <div className="text-[15px] font-semibold text-ink tabular-nums mt-0.5">
                      {formatNumber(wh.total_units)}
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-secondary">Stock Valuation</div>
                    <div className="text-[15px] font-semibold text-ink tabular-nums mt-0.5">
                      {formatCurrency(wh.total_valuation)}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-ink-secondary pt-1">
                  Manager:{' '}
                  <span className="font-medium text-ink">{wh.manager?.name ?? 'Unassigned'}</span>
                </div>
              </div>

              <div className="px-4 py-2.5 bg-canvas border-t border-line flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setInspectWarehouseId(wh.id)}
                  className="inline-flex items-center gap-1 font-medium text-ink-secondary hover:text-ink"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Inspect Stock
                </button>
                <button
                  type="button"
                  onClick={() => setLocationsTarget(wh)}
                  className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Bins ({wh.locations?.length ?? wh.locations_count ?? 0})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Warehouse Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingWarehouse ? `Edit Facility — ${editingWarehouse.code}` : 'New Warehouse Facility'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saveWarehouseMutation.isPending}
              onClick={handleSubmit((v) => saveWarehouseMutation.mutate(v))}
            >
              {editingWarehouse ? 'Update Facility' : 'Create Facility'}
            </Button>
          </>
        }
      >
        <form className="space-y-3.5" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="Warehouse Code" required error={errors.code?.message}>
              <Input placeholder="WH-SBY-02" className="font-mono uppercase" {...register('code')} />
            </FormField>
            <FormField label="City" error={errors.city?.message}>
              <Input placeholder="Jakarta / Surabaya" {...register('city')} />
            </FormField>
          </div>

          <FormField label="Facility Name" required error={errors.name?.message}>
            <Input placeholder="Central Distribution Hub" {...register('name')} />
          </FormField>

          <FormField label="Street Address" required error={errors.address?.message}>
            <Textarea rows={2} placeholder="Full facility street address..." {...register('address')} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="Facility Phone">
              <Input placeholder="+62 21-..." {...register('phone')} />
            </FormField>

            {usersPage && (
              <FormField label="Warehouse Manager">
                <Select {...register('manager_id')}>
                  <option value="">Unassigned</option>
                  {usersPage.items.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role?.name})
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-ink pt-1 cursor-pointer">
            <input type="checkbox" {...register('is_active')} />
            <span>Operational (accepts stock movements)</span>
          </label>
        </form>
      </Modal>

      {/* Storage Bin Locations Modal */}
      <Modal
        open={locationsTarget !== null}
        onClose={() => setLocationsTarget(null)}
        title={`Storage Locations — ${locationsTarget?.code}`}
        description={locationsTarget?.name}
        size="lg"
      >
        <div className="space-y-4">
          {hasPermission('warehouses.manage_locations') && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-canvas p-3 rounded-md border border-line">
              <div className="sm:col-span-3">
                <FormField label="Bin Code">
                  <Input
                    compact
                    placeholder="A-02-R1"
                    value={locCode}
                    onChange={(e) => setLocCode(e.target.value)}
                    className="font-mono uppercase"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-4">
                <FormField label="Location Name">
                  <Input
                    compact
                    placeholder="Pallet Rack A2"
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Zone">
                  <Input
                    compact
                    placeholder="Zone A"
                    value={locZone}
                    onChange={(e) => setLocZone(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Type">
                  <Select
                    compact
                    value={locType}
                    onChange={(e) => setLocType(e.target.value as typeof locType)}
                  >
                    <option value="storage">Storage</option>
                    <option value="receiving">Receiving</option>
                    <option value="picking">Picking</option>
                    <option value="staging">Staging</option>
                    <option value="returns">Returns</option>
                  </Select>
                </FormField>
              </div>
              <div className="sm:col-span-1">
                <Button
                  size="sm"
                  className="w-full"
                  loading={addLocationMutation.isPending}
                  disabled={!locCode.trim() || !locName.trim()}
                  onClick={() => addLocationMutation.mutate()}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="border border-line rounded-md overflow-hidden">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-canvas border-b border-line text-[11px] font-semibold uppercase text-ink-secondary">
                <tr>
                  <th className="px-3.5 py-2">Bin Code</th>
                  <th className="px-3.5 py-2">Description</th>
                  <th className="px-3.5 py-2">Zone</th>
                  <th className="px-3.5 py-2">Function</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(locationsTarget?.locations ?? []).map((loc) => (
                  <tr key={loc.id}>
                    <td className="px-3.5 py-2 font-mono text-xs font-semibold text-ink">
                      {loc.code}
                    </td>
                    <td className="px-3.5 py-2 text-ink">{loc.name}</td>
                    <td className="px-3.5 py-2 text-ink-secondary">{loc.zone ?? '—'}</td>
                    <td className="px-3.5 py-2">
                      <Badge variant="neutral">{loc.location_type}</Badge>
                    </td>
                    <td className="px-3.5 py-2">
                      <StatusBadge status={loc.is_active ? 'active' : 'inactive'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Warehouse Stock Inspection Modal */}
      <Modal
        open={inspectWarehouseId !== null}
        onClose={() => setInspectWarehouseId(null)}
        title={warehouseDetail ? `${warehouseDetail.code} — Stock Inventory` : 'Facility Inventory'}
        description={warehouseDetail?.name}
        size="lg"
      >
        <div className="border border-line rounded-md overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-canvas border-b border-line text-[11px] font-semibold uppercase text-ink-secondary">
              <tr>
                <th className="px-3.5 py-2">SKU / Product</th>
                <th className="px-3.5 py-2">Bin</th>
                <th className="px-3.5 py-2 text-right">On Hand</th>
                <th className="px-3.5 py-2 text-right">Reserved</th>
                <th className="px-3.5 py-2 text-right">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(warehouseDetail?.stocks ?? []).map((st) => (
                <tr key={st.id}>
                  <td className="px-3.5 py-2">
                    <div className="font-mono text-xs font-semibold text-ink">
                      {st.product?.sku}
                    </div>
                    <div className="text-xs text-ink-secondary">{st.product?.name}</div>
                  </td>
                  <td className="px-3.5 py-2 font-mono text-xs text-ink-secondary">
                    {st.location?.code ?? 'Unbinned'}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums">
                    {formatNumber(st.quantity_on_hand)}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums text-ink-secondary">
                    {formatNumber(st.reserved_quantity)}
                  </td>
                  <td className="px-3.5 py-2 text-right tabular-nums font-semibold text-ink">
                    {formatNumber(st.available_quantity)}
                  </td>
                </tr>
              ))}
              {(warehouseDetail?.stocks?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-ink-secondary">
                    No active stock balances in this facility.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
