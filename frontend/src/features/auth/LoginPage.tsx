import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import type { AuthUser } from '@/types/domain';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormControls';

const loginSchema = z.object({
  email: z.string().email('Enter a valid corporate email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

const demoRoles = [
  {
    role: 'System Admin',
    email: 'admin@stratawms.io',
    scope: 'Full system, all 3 warehouses, settings & RBAC',
  },
  {
    role: 'Warehouse Manager',
    email: 'manager@stratawms.io',
    scope: 'Jakarta & Bandung hubs, POs & adjustment approvals',
  },
  {
    role: 'Warehouse Staff',
    email: 'staff@stratawms.io',
    scope: 'Jakarta hub receiving, stock out & cycle counts',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setSelectedWarehouseId = useUiStore((s) => s.setSelectedWarehouseId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@stratawms.io',
      password: 'Password123!',
    },
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    setLoading(true);
    try {
      const data = await apiClient.post<{ token: string; user: AuthUser }>('/auth/login', {
        ...values,
        device_name: 'strata-web-spa',
      });
      setSelectedWarehouseId(null);
      setSession(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to reach Strata WMS API server. Verify the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-[420px]">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-brand text-white flex items-center justify-center font-semibold text-sm tracking-wider">
            SW
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-ink tracking-tight leading-none">
              Strata WMS
            </h1>
            <p className="text-xs text-ink-secondary mt-1">
              Enterprise Inventory & Multi-Warehouse Ledger
            </p>
          </div>
        </div>

        {/* Sign-in Card */}
        <div className="bg-surface border border-line rounded-lg shadow-panel p-6">
          <div className="mb-5">
            <h2 className="text-[16px] font-semibold text-ink">Operator Sign In</h2>
            <p className="text-[13px] text-ink-secondary mt-0.5">
              Authenticate with your assigned employee credentials.
            </p>
          </div>

          {serverError && (
            <div className="mb-4 px-3 py-2.5 rounded-md bg-status-danger-bg border border-status-danger-border text-xs text-status-danger">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField label="Work Email" htmlFor="email" required error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                hasError={!!errors.email}
                {...register('email')}
              />
            </FormField>

            <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                hasError={!!errors.password}
                {...register('password')}
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              leftIcon={<Lock className="w-3.5 h-3.5" />}
              className="w-full"
            >
              Sign In to Workspace
            </Button>
          </form>
        </div>

        {/* Development / Demo Role Switcher Helper */}
        <div className="mt-4 bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-brand" />
            <span>Demo Sandbox Accounts (Password: Password123!)</span>
          </div>
          <div className="space-y-1.5">
            {demoRoles.map((acct) => (
              <button
                key={acct.email}
                type="button"
                onClick={() => {
                  setValue('email', acct.email);
                  setValue('password', 'Password123!');
                }}
                className="w-full text-left px-2.5 py-2 rounded border border-line hover:border-brand hover:bg-brand-subtle/40 transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink">{acct.role}</div>
                  <div className="text-[11px] text-ink-secondary truncate">{acct.scope}</div>
                </div>
                <span className="text-[11px] font-mono text-brand shrink-0">Use</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
