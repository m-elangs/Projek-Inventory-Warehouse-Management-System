import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Users } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatDateTime } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useToastStore } from '@/stores/toastStore';
import type { EmployeeRecord, RoleSummary, Warehouse } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormControls';
import { Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';

const userSchema = z.object({
  employee_code: z.string().min(2, 'Employee code required').max(40),
  name: z.string().min(2, 'Full name required').max(150),
  email: z.string().email('Valid email required'),
  phone: z.string().max(30).optional(),
  password: z.string().optional(),
  role_id: z.coerce.number().min(1, 'Select role'),
  is_active: z.boolean().default(true),
});

type UserFormValues = z.infer<typeof userSchema>;

export function UsersPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EmployeeRecord | null>(null);
  const [selectedWhIds, setSelectedWhIds] = useState<number[]>([]);

  const params = { search: debouncedSearch, page, per_page: 15 };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => apiClient.getPaginated<EmployeeRecord>('/admin/users', params),
  });

  const { data: roles = [] } = useQuery({
    queryKey: queryKeys.roles(),
    queryFn: () => apiClient.get<RoleSummary[]>('/admin/roles'),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses(),
    queryFn: () => apiClient.get<Warehouse[]>('/warehouses'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
  });

  const openCreate = () => {
    setEditingUser(null);
    setSelectedWhIds([]);
    reset({
      employee_code: '',
      name: '',
      email: '',
      phone: '',
      password: '',
      role_id: roles[0]?.id ?? 0,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (emp: EmployeeRecord) => {
    setEditingUser(emp);
    setSelectedWhIds((emp.warehouses ?? []).map((w) => w.id));
    reset({
      employee_code: emp.employee_code,
      name: emp.name,
      email: emp.email,
      phone: emp.phone ?? '',
      password: '',
      role_id: emp.role_id,
      is_active: emp.is_active,
    });
    setModalOpen(true);
  };

  const toggleWh = (id: number) => {
    setSelectedWhIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveMutation = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload: Record<string, unknown> = {
        ...values,
        warehouse_ids: selectedWhIds,
      };
      if (!values.password) {
        delete payload.password;
      }
      return editingUser
        ? apiClient.put(`/admin/users/${editingUser.id}`, payload)
        : apiClient.post('/admin/users', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      pushToast({
        type: 'success',
        title: editingUser ? 'Employee updated' : 'Employee account created',
      });
      setModalOpen(false);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Check required fields.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employee & Access Management"
        description="Provision employee accounts, assign RBAC roles, and scope facility access."
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={openCreate}
          >
            New Employee
          </Button>
        }
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              compact
              placeholder="Search employee code, name, or email..."
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
                <th className="px-3.5 py-2.5">Employee</th>
                <th className="px-3.5 py-2.5">Role</th>
                <th className="px-3.5 py-2.5">Assigned Warehouses</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Last Sign-In</th>
                <th className="px-3.5 py-2.5 text-right">Edit</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Users className="w-5 h-5" />}
                      title="No employee accounts found"
                      description="Create user accounts to grant warehouse access."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((emp) => (
                  <tr key={emp.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-ink">
                      {emp.employee_code}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-ink">{emp.name}</div>
                      <div className="text-xs text-ink-secondary">{emp.email}</div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge variant={emp.role?.slug === 'admin' ? 'brand' : 'neutral'}>
                        {emp.role?.name}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      {emp.role?.slug === 'admin' ? (
                        <span className="text-xs text-ink-secondary">All Facilities (Global)</span>
                      ) : (emp.warehouses?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {emp.warehouses?.map((w) => (
                            <span
                              key={w.id}
                              className="px-1.5 py-0.5 rounded bg-canvas border border-line font-mono text-[11px] text-ink"
                            >
                              {w.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-status-warning">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={emp.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-xs text-ink-secondary">
                      {formatDateTime(emp.last_login_at)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(emp)}
                        className="p-1.5 rounded text-ink-secondary hover:text-brand hover:bg-brand-subtle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Create / Edit Employee Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? `Edit Employee — ${editingUser.employee_code}` : 'Create Employee Account'}
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
              {editingUser ? 'Save Account' : 'Create Account'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="Employee Code" required error={errors.employee_code?.message}>
              <Input placeholder="EMP-0301" className="font-mono uppercase" {...register('employee_code')} />
            </FormField>

            <FormField label="Role" required error={errors.role_id?.message}>
              <Select {...register('role_id')}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Full Name" required error={errors.name?.message}>
              <Input placeholder="Employee name" {...register('name')} />
            </FormField>

            <FormField label="Work Email" required error={errors.email?.message}>
              <Input type="email" placeholder="employee@stratawms.io" {...register('email')} />
            </FormField>

            <FormField label="Phone">
              <Input placeholder="+62..." {...register('phone')} />
            </FormField>

            <FormField
              label={editingUser ? 'New Password (leave blank to keep)' : 'Initial Password'}
              required={!editingUser}
            >
              <Input type="password" placeholder="Min 8 characters" {...register('password')} />
            </FormField>
          </div>

          <div>
            <div className="text-[13px] font-medium text-ink mb-1.5">
              Warehouse Access Assignments
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-md border border-line bg-canvas">
              {warehouses.map((w) => (
                <label
                  key={w.id}
                  className="flex items-center gap-2 text-xs text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedWhIds.includes(w.id)}
                    onChange={() => toggleWh(w.id)}
                  />
                  <span className="font-mono font-semibold">{w.code}</span>
                  <span className="text-ink-secondary truncate">{w.name}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input type="checkbox" {...register('is_active')} />
            <span>Account Active (permitted to sign in)</span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
