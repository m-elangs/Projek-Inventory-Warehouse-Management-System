import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/apiClient';
import type { AuthUser } from '@/types/domain';
import { AppShell } from '@/components/layout/AppShell';
import { ToastViewport } from '@/components/ui/ToastViewport';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { WarehousesPage } from '@/features/warehouses/WarehousesPage';
import { StockMovementsPage } from '@/features/movements/StockMovementsPage';
import { PurchaseOrdersPage } from '@/features/purchase-orders/PurchaseOrdersPage';
import { StockTransfersPage } from '@/features/transfers/StockTransfersPage';
import { StockAdjustmentsPage } from '@/features/adjustments/StockAdjustmentsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { InventoryReportsPage } from '@/features/reports/InventoryReportsPage';
import { TransactionReportsPage } from '@/features/reports/TransactionReportsPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { RolesPage } from '@/features/admin/RolesPage';
import { SettingsPage } from '@/features/admin/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { token, user, hasPermission } = useAuthStore();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="bg-surface border border-line rounded-lg p-8 text-center max-w-md mx-auto mt-12">
        <h2 className="text-base font-semibold text-ink">Access Restricted</h2>
        <p className="text-xs text-ink-secondary mt-1">
          Your assigned role ({user.role?.name}) does not include the required permission (
          <code className="font-mono">{permission}</code>).
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { token, updateUser } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    apiClient
      .get<AuthUser>('/auth/me')
      .then((freshUser) => updateUser(freshUser))
      .catch(() => {
        // 401 handler in apiClient clears invalid sessions automatically
      });
  }, [token, updateUser]);

  return <>{children}</>;
}

export function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap>
          <Routes>
            <Route
              path="/login"
              element={token ? <Navigate to="/" replace /> : <LoginPage />}
            />

            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute permission="inventory.view">
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/products"
                element={
                  <ProtectedRoute permission="products.view">
                    <ProductsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/warehouses"
                element={
                  <ProtectedRoute permission="warehouses.view">
                    <WarehousesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/stock-movements"
                element={
                  <ProtectedRoute permission="inventory.view">
                    <StockMovementsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/purchase-orders"
                element={
                  <ProtectedRoute permission="purchase_orders.view">
                    <PurchaseOrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/stock-transfers"
                element={
                  <ProtectedRoute permission="transfers.view">
                    <StockTransfersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/stock-adjustments"
                element={
                  <ProtectedRoute permission="adjustments.view">
                    <StockAdjustmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/suppliers"
                element={
                  <ProtectedRoute permission="suppliers.view">
                    <SuppliersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/inventory"
                element={
                  <ProtectedRoute permission="reports.inventory">
                    <InventoryReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/transactions"
                element={
                  <ProtectedRoute permission="reports.transactions">
                    <TransactionReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute permission="users.manage">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/roles"
                element={
                  <ProtectedRoute permission="roles.manage">
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute permission="settings.manage">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastViewport />
        </SessionBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
