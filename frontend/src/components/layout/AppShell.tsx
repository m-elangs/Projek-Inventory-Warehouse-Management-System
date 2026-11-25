import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Boxes,
  Package,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  ClipboardList,
  Truck,
  SlidersHorizontal,
  Building2,
  BarChart3,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/FormControls';
import { QuickStockOperationModal } from './QuickStockOperationModal';
import { ProfileSettingsModal } from './ProfileSettingsModal';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions?: string[];
}

interface NavSection {
  group: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    group: 'MAIN',
    items: [
      { label: 'Overview', to: '/', icon: LayoutGrid, permissions: ['dashboard.view'] },
      { label: 'Inventory', to: '/inventory', icon: Boxes, permissions: ['inventory.view'] },
      { label: 'Products', to: '/products', icon: Package, permissions: ['products.view'] },
      { label: 'Warehouses', to: '/warehouses', icon: WarehouseIcon, permissions: ['warehouses.view'] },
      { label: 'Stock Movements', to: '/stock-movements', icon: ArrowLeftRight, permissions: ['inventory.view'] },
    ],
  },
  {
    group: 'OPERATIONS',
    items: [
      { label: 'Purchase Orders', to: '/purchase-orders', icon: ClipboardList, permissions: ['purchase_orders.view'] },
      { label: 'Stock Transfers', to: '/stock-transfers', icon: Truck, permissions: ['transfers.view'] },
      { label: 'Stock Adjustments', to: '/stock-adjustments', icon: SlidersHorizontal, permissions: ['adjustments.view'] },
      { label: 'Suppliers', to: '/suppliers', icon: Building2, permissions: ['suppliers.view'] },
    ],
  },
  {
    group: 'ANALYTICS',
    items: [
      { label: 'Inventory Reports', to: '/reports/inventory', icon: BarChart3, permissions: ['reports.inventory'] },
      { label: 'Transaction Reports', to: '/reports/transactions', icon: FileSpreadsheet, permissions: ['reports.transactions'] },
    ],
  },
  {
    group: 'ADMINISTRATION',
    items: [
      { label: 'User Management', to: '/admin/users', icon: Users, permissions: ['users.manage'] },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: ShieldCheck, permissions: ['roles.manage'] },
      { label: 'Settings', to: '/admin/settings', icon: Settings, permissions: ['settings.manage'] },
    ],
  },
];

const routeMeta: Record<string, { group: string; title: string }> = {
  '/': { group: 'Main', title: 'Overview' },
  '/inventory': { group: 'Main', title: 'Inventory' },
  '/products': { group: 'Main', title: 'Products' },
  '/warehouses': { group: 'Main', title: 'Warehouses' },
  '/stock-movements': { group: 'Main', title: 'Stock Movements' },
  '/purchase-orders': { group: 'Operations', title: 'Purchase Orders' },
  '/stock-transfers': { group: 'Operations', title: 'Stock Transfers' },
  '/stock-adjustments': { group: 'Operations', title: 'Stock Adjustments' },
  '/suppliers': { group: 'Operations', title: 'Suppliers' },
  '/reports/inventory': { group: 'Analytics', title: 'Inventory Reports' },
  '/reports/transactions': { group: 'Analytics', title: 'Transaction Reports' },
  '/admin/users': { group: 'Administration', title: 'User Management' },
  '/admin/roles': { group: 'Administration', title: 'Roles & Permissions' },
  '/admin/settings': { group: 'Administration', title: 'Settings' },
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, clearSession, hasAnyPermission, hasPermission } = useAuthStore();
  const {
    sidebarCollapsed,
    mobileMenuOpen,
    selectedWarehouseId,
    quickStockModal,
    toggleSidebar,
    setMobileMenuOpen,
    setSelectedWarehouseId,
    setQuickStockModal,
  } = useUiStore();

  const currentCrumb = routeMeta[location.pathname] ?? { group: 'Workspace', title: 'Details' };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Clear local session regardless of network state
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  const accessibleWarehouses = user?.warehouses ?? [];

  const renderSidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full bg-surface border-r border-line select-none">
      {/* Brand Bar */}
      <div className="h-[52px] px-4 flex items-center justify-between border-b border-line shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded bg-brand text-white flex items-center justify-center font-semibold text-xs tracking-wider shrink-0">
            SW
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink tracking-tight truncate">
                Strata WMS
              </div>
              <div className="text-[11px] text-ink-secondary leading-none truncate">
                Inventory Ledger
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4" aria-label="Main navigation">
        {navSections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.permissions || hasAnyPermission(item.permissions)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.group}>
              {!collapsed && (
                <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
                  {section.group}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px] font-medium transition-colors ${
                          isActive
                            ? 'bg-brand-subtle text-brand'
                            : 'text-ink-secondary hover:text-ink hover:bg-canvas'
                        } ${collapsed ? 'justify-center px-0' : ''}`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Signed-in Operator Footer */}
      <div className="p-3 border-t border-line bg-canvas/60 shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="min-w-0 text-left hover:opacity-80 transition-opacity"
              title="Account settings & password"
            >
              <p className="text-[13px] font-medium text-ink truncate">{user?.name}</p>
              <p className="text-[11px] text-ink-secondary truncate">
                {user?.role?.name} · <span className="font-mono">{user?.employee_code}</span>
              </p>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded text-ink-secondary hover:text-status-danger hover:bg-status-danger-bg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="w-full flex justify-center p-1.5 rounded text-ink-secondary hover:text-status-danger hover:bg-status-danger-bg"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-canvas text-ink">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-[60px]' : 'w-[236px]'
        }`}
      >
        <div className={`fixed inset-y-0 left-0 z-30 ${sidebarCollapsed ? 'w-[60px]' : 'w-[236px]'}`}>
          {renderSidebarContent(sidebarCollapsed)}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#171A21]/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-[248px] max-w-[80vw] h-full">
            {renderSidebarContent(false)}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3.5 right-3 p-1 rounded text-ink-secondary hover:text-ink"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Operational Header */}
        <header className="sticky top-0 z-20 h-[50px] bg-surface border-b border-line px-4 lg:px-6 flex items-center justify-between gap-4">
          {/* Left Area: Toggle & Breadcrumbs */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded text-ink-secondary hover:text-ink hover:bg-canvas"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:inline-flex p-1.5 rounded text-ink-secondary hover:text-ink hover:bg-canvas"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] min-w-0">
              <span className="text-ink-secondary hidden sm:inline">{currentCrumb.group}</span>
              <ChevronRight className="w-3.5 h-3.5 text-ink-muted hidden sm:inline shrink-0" />
              <span className="font-semibold text-ink truncate">{currentCrumb.title}</span>
            </nav>
          </div>

          {/* Operational Toolbar + Operator Profile grouped together */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            {/* Facility Context Switcher */}
            <div className="flex items-center gap-1.5 bg-canvas/80 border border-line rounded px-2 py-0.5 shadow-2xs">
              <WarehouseIcon className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="text-[11px] font-semibold tracking-wider uppercase text-ink-secondary hidden md:inline">
                Facility
              </span>
              <Select
                compact
                aria-label="Active warehouse scope"
                value={selectedWarehouseId ?? ''}
                onChange={(e) =>
                  setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-[185px] sm:w-[225px] text-[15px] font-medium border-0 bg-transparent shadow-none focus:ring-0 py-0.5"
              >
                <option value="">
                  {user?.is_admin ? 'All Warehouses (Global)' : 'All Assigned Warehouses'}
                </option>
                {accessibleWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Quick Actions */}
            {hasPermission('inventory.stock_in') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQuickStockModal('in')}
                leftIcon={<ArrowDownToLine className="w-3.5 h-3.5 text-status-success" />}
                className="h-7 text-xs px-2.5"
              >
                <span className="hidden sm:inline">Stock In</span>
              </Button>
            )}

            {hasPermission('inventory.stock_out') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQuickStockModal('out')}
                leftIcon={<ArrowUpFromLine className="w-3.5 h-3.5 text-status-warning" />}
                className="h-7 text-xs px-2.5"
              >
                <span className="hidden sm:inline">Stock Out</span>
              </Button>
            )}

            <div className="hidden sm:block h-4 w-px bg-line mx-0.5" />

            {/* Operator Profile Pill placed directly next to Stock Out */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-canvas text-left transition-colors border border-transparent hover:border-line"
              title="Account profile & settings"
            >
              <div className="w-6 h-6 rounded bg-brand-subtle text-brand flex items-center justify-center font-medium text-xs shrink-0">
                {user?.name?.charAt(0) ?? 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[12px] font-medium text-ink leading-tight">{user?.name}</div>
                <div className="text-[10px] text-ink-secondary leading-tight">{user?.role?.name}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Page Container: Full width with no empty right margin */}
        <main className="flex-1 px-4 lg:px-6 py-4 w-full min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Global Stock In / Stock Out Modal */}
      <QuickStockOperationModal
        mode={quickStockModal}
        onClose={() => setQuickStockModal(null)}
      />

      <ProfileSettingsModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}
