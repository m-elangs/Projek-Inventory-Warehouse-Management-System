import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, Edit2, Eye } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Supplier } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea } from '@/components/ui/FormControls';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';

const supplierSchema = z.object({
  code: z.string().min(2, 'Code required').max(40),
  company_name: z.string().min(2, 'Company name required').max(180),
  contact_person: z.string().max(120).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  city: z.string().max(100).optional(),
  payment_terms: z.string().max(60).default('Net 30'),
  tax_id: z.string().max(60).optional(),
  address: z.string().max(1000).optional(),
  is_active: z.boolean().default(true),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [inspectId, setInspectId] = useState<number | null>(null);

  const params = { search: debouncedSearch, page, per_page: 15 };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.suppliers(params),
    queryFn: () => apiClient.getPaginated<Supplier>('/suppliers', params),
  });

  const { data: supplierDetail } = useQuery({
    queryKey: queryKeys.supplierDetail(inspectId),
    queryFn: () => apiClient.get<Supplier>(`/suppliers/${inspectId}`),
    enabled: inspectId !== null,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
  });

  const openCreate = () => {
    setEditingSupplier(null);
    reset({
      code: '',
      company_name: '',
      contact_person: '',
      email: '',
      phone: '',
      city: '',
      payment_terms: 'Net 30',
      tax_id: '',
      address: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    reset({
      code: sup.code,
      company_name: sup.company_name,
      contact_person: sup.contact_person ?? '',
      email: sup.email ?? '',
      phone: sup.phone ?? '',
      city: sup.city ?? '',
      payment_terms: sup.payment_terms ?? 'Net 30',
      tax_id: sup.tax_id ?? '',
      address: sup.address ?? '',
      is_active: sup.is_active,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (values: SupplierFormValues) =>
      editingSupplier
        ? apiClient.put(`/suppliers/${editingSupplier.id}`, values)
        : apiClient.post('/suppliers', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      pushToast({
        type: 'success',
        title: editingSupplier ? 'Supplier updated' : 'Supplier added',
      });
      setModalOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Check fields.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Directory"
        description="Manage approved procurement vendors, payment terms, and historical order fulfillment."
        actions={
          hasPermission('suppliers.create') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={openCreate}
            >
              Add Supplier
            </Button>
          ) : undefined
        }
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              compact
              placeholder="Search code, company, contact, or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">Code</th>
                <th className="px-3.5 py-2.5">Company</th>
                <th className="px-3.5 py-2.5">Contact</th>
                <th className="px-3.5 py-2.5">Terms</th>
                <th className="px-3.5 py-2.5 text-right">PO Count</th>
                <th className="px-3.5 py-2.5 text-right">Total Spend</th>
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
                      icon={<Building2 className="w-5 h-5" />}
                      title="No suppliers registered"
                      description="Register vendor accounts to issue purchase orders and track inbound receipts."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((sup) => (
                  <tr key={sup.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-ink">
                      {sup.code}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-ink">{sup.company_name}</div>
                      {sup.city && <div className="text-xs text-ink-secondary">{sup.city}</div>}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="text-ink">{sup.contact_person ?? '—'}</div>
                      {sup.email && <div className="text-xs text-ink-secondary">{sup.email}</div>}
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{sup.payment_terms}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">
                      {sup.purchase_orders_count ?? 0}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(sup.total_purchased_amount)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={sup.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectId(sup.id)}
                          title="Transaction history"
                          className="p-1.5 rounded text-ink-secondary hover:text-ink hover:bg-canvas"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {hasPermission('suppliers.update') && (
                          <button
                            type="button"
                            onClick={() => openEdit(sup)}
                            title="Edit supplier"
                            className="p-1.5 rounded text-ink-secondary hover:text-brand hover:bg-brand-subtle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Create / Edit Supplier Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSupplier ? `Edit Supplier — ${editingSupplier.code}` : 'New Supplier'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={handleSubmit((v) => saveMutation.mutate(v))}
            >
              {editingSupplier ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3.5" onSubmit={(e) => e.preventDefault()}>
          <FormField label="Supplier Code" required error={errors.code?.message}>
            <Input placeholder="SUP-ACME" className="font-mono uppercase" {...register('code')} />
          </FormField>
          <FormField label="Payment Terms">
            <Input placeholder="Net 30" {...register('payment_terms')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Company Name" required error={errors.company_name?.message}>
              <Input placeholder="Registered corporate entity name" {...register('company_name')} />
            </FormField>
          </div>
          <FormField label="Primary Contact Person">
            <Input placeholder="Account manager name" {...register('contact_person')} />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <Input type="email" placeholder="orders@vendor.com" {...register('email')} />
          </FormField>
          <FormField label="Phone">
            <Input placeholder="+1 / +62..." {...register('phone')} />
          </FormField>
          <FormField label="City">
            <Input placeholder="Singapore / Jakarta" {...register('city')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Address">
              <Textarea rows={2} {...register('address')} />
            </FormField>
          </div>
        </form>
      </Modal>

      {/* Supplier Transaction History Modal */}
      <Modal
        open={inspectId !== null}
        onClose={() => setInspectId(null)}
        title={supplierDetail ? `${supplierDetail.code} — ${supplierDetail.company_name}` : 'Supplier History'}
        description="Purchase orders and goods receipts recorded with this vendor."
        size="lg"
      >
        {supplierDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-canvas p-3 rounded border border-line text-xs">
              <div>
                <div className="text-ink-secondary">Contact</div>
                <div className="font-medium text-ink mt-0.5">{supplierDetail.contact_person ?? '—'}</div>
              </div>
              <div>
                <div className="text-ink-secondary">Email / Phone</div>
                <div className="font-medium text-ink mt-0.5">
                  {supplierDetail.email ?? supplierDetail.phone ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-ink-secondary">Terms</div>
                <div className="font-medium text-ink mt-0.5">{supplierDetail.payment_terms}</div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">
                Purchase Orders
              </h3>
              <div className="border border-line rounded-md overflow-hidden">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-canvas border-b border-line text-[11px] uppercase text-ink-secondary">
                    <tr>
                      <th className="px-3 py-2">PO #</th>
                      <th className="px-3 py-2">Warehouse</th>
                      <th className="px-3 py-2">Order Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(supplierDetail.purchase_orders ?? []).map((po) => (
                      <tr key={po.id}>
                        <td className="px-3 py-2 font-mono text-xs font-semibold">{po.po_number}</td>
                        <td className="px-3 py-2 font-mono text-xs text-ink-secondary">{po.warehouse?.code}</td>
                        <td className="px-3 py-2 tabular-nums">{formatDate(po.order_date)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={po.status} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {formatCurrency(po.total_amount)}
                        </td>
                      </tr>
                    ))}
                    {(supplierDetail.purchase_orders?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-ink-secondary">
                          No purchase orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
