import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Save } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useToastStore } from '@/stores/toastStore';
import type { PermissionItem, RoleSummary } from '@/types/domain';
import { PageHeader } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export function RolesPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.pushToast);

  const { data: roles = [] } = useQuery({
    queryKey: queryKeys.roles(),
    queryFn: () => apiClient.get<RoleSummary[]>('/admin/roles'),
  });

  const { data: permissions = [] } = useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => apiClient.get<PermissionItem[]>('/admin/permissions'),
  });

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);

  const activeRole = roles.find((r) => r.id === (selectedRoleId ?? roles[0]?.id));

  useEffect(() => {
    if (activeRole) {
      setCheckedIds((activeRole.permissions ?? []).map((p) => p.id));
    }
  }, [activeRole]);

  const groupedPermissions = permissions.reduce<Record<string, PermissionItem[]>>((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {});

  const togglePermission = (id: number) => {
    if (activeRole?.slug === 'admin') return;
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/admin/roles/${activeRole?.id}`, {
        permission_ids: checkedIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles() });
      pushToast({
        type: 'success',
        title: 'Role permissions updated',
        description: `Saved ${checkedIds.length} capabilities for ${activeRole?.name}.`,
      });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Update blocked',
        description: err instanceof ApiError ? err.message : 'Unable to save permissions.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles & Permission Matrix"
        description="Enforce backend-validated RBAC boundaries across catalog, procurement, warehouse operations, and reports."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Role Selector Column */}
        <div className="lg:col-span-4 space-y-2.5">
          {roles.map((role) => {
            const isSelected = role.id === activeRole?.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-surface border-brand ring-1 ring-brand/20'
                    : 'bg-surface border-line hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand" />
                    <span className="text-sm font-semibold text-ink">{role.name}</span>
                  </div>
                  <Badge variant="neutral">{role.users_count ?? 0} users</Badge>
                </div>
                <p className="text-xs text-ink-secondary mt-1.5 leading-relaxed">
                  {role.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Granular Permission Matrix */}
        <div className="lg:col-span-8 bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
          {activeRole && (
            <>
              <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas">
                <div>
                  <h2 className="text-sm font-semibold text-ink">
                    {activeRole.name} — Assigned Capabilities ({checkedIds.length})
                  </h2>
                  <p className="text-xs text-ink-secondary">
                    {activeRole.slug === 'admin'
                      ? 'System Administrator retains unrestricted access across all modules.'
                      : 'Toggle permissions enforced by Laravel Policies and API Middleware.'}
                  </p>
                </div>

                {activeRole.slug !== 'admin' && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saveMutation.isPending}
                    leftIcon={<Save className="w-3.5 h-3.5" />}
                    onClick={() => saveMutation.mutate()}
                  >
                    Save Policy
                  </Button>
                )}
              </div>

              <div className="p-4 space-y-4">
                {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                  <div key={moduleName} className="border border-line rounded-md overflow-hidden">
                    <div className="px-3 py-1.5 bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                      {moduleName}
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {perms.map((perm) => {
                        const checked =
                          activeRole.slug === 'admin' || checkedIds.includes(perm.id);
                        return (
                          <label
                            key={perm.id}
                            className={`flex items-start gap-2.5 text-xs ${
                              activeRole.slug === 'admin'
                                ? 'opacity-80 cursor-default'
                                : 'cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={activeRole.slug === 'admin'}
                              onChange={() => togglePermission(perm.id)}
                              className="mt-0.5"
                            />
                            <div>
                              <div className="font-medium text-ink">{perm.name}</div>
                              <div className="font-mono text-[11px] text-ink-muted">
                                {perm.slug}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
