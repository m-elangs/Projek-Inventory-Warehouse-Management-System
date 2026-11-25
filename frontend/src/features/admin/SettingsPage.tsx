import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatDateTime } from '@/lib/formatters';
import { useToastStore } from '@/stores/toastStore';
import type { ActivityLogItem } from '@/types/domain';
import { PageHeader, Pagination } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormControls';
import { Badge } from '@/components/ui/Badge';

type SettingsMap = Record<string, { value: unknown; group: string; type: string }>;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.pushToast);

  const [tab, setTab] = useState<'general' | 'audit'>('general');
  const [logModule, setLogModule] = useState('');
  const [logPage, setLogPage] = useState(1);

  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [currencyCode, setCurrencyCode] = useState('IDR');
  const [poPrefix, setPoPrefix] = useState('PO');
  const [transferPrefix, setTransferPrefix] = useState('TRF');
  const [adjustmentPrefix, setAdjustmentPrefix] = useState('ADJ');
  const [receiptPrefix, setReceiptPrefix] = useState('GRN');
  const [lowStockDefault, setLowStockDefault] = useState(15);
  const [requireAdjApproval, setRequireAdjApproval] = useState(true);

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => apiClient.get<SettingsMap>('/admin/settings'),
  });

  useEffect(() => {
    if (!settings) return;
    setCompanyName(String(settings.company_name?.value ?? 'Strata Logistics Corp.'));
    setCompanyEmail(String(settings.company_email?.value ?? ''));
    setCurrencyCode(String(settings.currency_code?.value ?? 'IDR'));
    setPoPrefix(String(settings.po_prefix?.value ?? 'PO'));
    setTransferPrefix(String(settings.transfer_prefix?.value ?? 'TRF'));
    setAdjustmentPrefix(String(settings.adjustment_prefix?.value ?? 'ADJ'));
    setReceiptPrefix(String(settings.receipt_prefix?.value ?? 'GRN'));
    setLowStockDefault(Number(settings.low_stock_threshold_default?.value ?? 15));
    setRequireAdjApproval(Boolean(settings.require_adjustment_approval?.value ?? true));
  }, [settings]);

  const logParams = { module: logModule || undefined, page: logPage, per_page: 20 };
  const { data: logsPage } = useQuery({
    queryKey: queryKeys.activityLogs(logParams),
    queryFn: () => apiClient.getPaginated<ActivityLogItem>('/admin/activity-logs', logParams),
    enabled: tab === 'audit',
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put('/admin/settings', {
        company_name: companyName,
        company_email: companyEmail || null,
        currency_code: currencyCode.toUpperCase(),
        po_prefix: poPrefix.toUpperCase(),
        transfer_prefix: transferPrefix.toUpperCase(),
        adjustment_prefix: adjustmentPrefix.toUpperCase(),
        receipt_prefix: receiptPrefix.toUpperCase(),
        low_stock_threshold_default: Number(lowStockDefault),
        require_adjustment_approval: requireAdjApproval,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      pushToast({ type: 'success', title: 'System settings saved' });
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
        title="System Settings & Audit Governance"
        description="Configure organization defaults, document numbering prefixes, and inspect immutable system audit logs."
      />

      <div className="inline-flex rounded-md border border-line bg-surface p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`px-3 py-1.5 rounded font-medium ${
            tab === 'general' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
          }`}
        >
          Organization & Document Prefixes
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-3 py-1.5 rounded font-medium ${
            tab === 'audit' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'
          }`}
        >
          Security & Activity Audit Log
        </button>
      </div>

      {tab === 'general' ? (
        <div className="bg-surface border border-line rounded-lg shadow-panel max-w-3xl">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Organization Name" required>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </FormField>

              <FormField label="Operations Contact Email">
                <Input
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                />
              </FormField>

              <FormField label="Valuation Currency (ISO 4217)" required>
                <Input
                  maxLength={3}
                  className="font-mono uppercase"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                />
              </FormField>

              <FormField label="Default Low Stock Threshold">
                <Input
                  type="number"
                  min={0}
                  className="tabular-nums"
                  value={lowStockDefault}
                  onChange={(e) => setLowStockDefault(Number(e.target.value))}
                />
              </FormField>
            </div>

            <div className="pt-3 border-t border-line">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-3">
                Document Sequence Prefixes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Purchase Order">
                  <Input
                    className="font-mono uppercase"
                    value={poPrefix}
                    onChange={(e) => setPoPrefix(e.target.value)}
                  />
                </FormField>
                <FormField label="Goods Receipt">
                  <Input
                    className="font-mono uppercase"
                    value={receiptPrefix}
                    onChange={(e) => setReceiptPrefix(e.target.value)}
                  />
                </FormField>
                <FormField label="Stock Transfer">
                  <Input
                    className="font-mono uppercase"
                    value={transferPrefix}
                    onChange={(e) => setTransferPrefix(e.target.value)}
                  />
                </FormField>
                <FormField label="Stock Adjustment">
                  <Input
                    className="font-mono uppercase"
                    value={adjustmentPrefix}
                    onChange={(e) => setAdjustmentPrefix(e.target.value)}
                  />
                </FormField>
              </div>
            </div>

            <div className="pt-3 border-t border-line">
              <label className="inline-flex items-center gap-2.5 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireAdjApproval}
                  onChange={(e) => setRequireAdjApproval(e.target.checked)}
                />
                <span>Require Manager / Admin approval before stock adjustments alter balances</span>
              </label>
            </div>
          </div>

          <div className="px-5 py-3 bg-canvas border-t border-line flex justify-end">
            <Button
              variant="primary"
              size="sm"
              loading={saveMutation.isPending}
              leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={() => saveMutation.mutate()}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center gap-2.5">
            <Select
              compact
              value={logModule}
              onChange={(e) => {
                setLogModule(e.target.value);
                setLogPage(1);
              }}
              className="w-[185px]"
            >
              <option value="">All System Modules</option>
              <option value="auth">Authentication</option>
              <option value="inventory">Inventory</option>
              <option value="purchase_orders">Purchase Orders</option>
              <option value="transfers">Transfers</option>
              <option value="adjustments">Adjustments</option>
              <option value="products">Products</option>
              <option value="users">Users</option>
              <option value="settings">Settings</option>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  <th className="px-3.5 py-2.5">Timestamp</th>
                  <th className="px-3.5 py-2.5">Module</th>
                  <th className="px-3.5 py-2.5">Action</th>
                  <th className="px-3.5 py-2.5">Description</th>
                  <th className="px-3.5 py-2.5">Actor</th>
                  <th className="px-3.5 py-2.5 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {(logsPage?.items ?? []).map((log) => (
                  <tr key={log.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5 tabular-nums text-xs text-ink-secondary">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge variant="neutral">{log.module}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-ink">{log.action}</td>
                    <td className="px-3.5 py-2.5 text-ink">{log.description}</td>
                    <td className="px-3.5 py-2.5 text-xs text-ink-secondary">
                      {log.user ? `${log.user.name} (${log.user.employee_code})` : 'System'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-xs text-ink-muted">
                      {log.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={logsPage?.meta} onPageChange={setLogPage} />
        </div>
      )}
    </div>
  );
}
