import React from 'react';

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const badgeStyles: Record<BadgeVariant, string> = {
  neutral: 'bg-canvas text-ink-secondary border-line',
  brand: 'bg-brand-subtle text-brand border-brand-muted',
  success: 'bg-status-success-bg text-status-success border-status-success-border',
  warning: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  danger: 'bg-status-danger-bg text-status-danger border-status-danger-border',
};

export function Badge({
  variant = 'neutral',
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border leading-4 whitespace-nowrap ${badgeStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  // Health & Active
  healthy: { label: 'In Stock', variant: 'success' },
  low_stock: { label: 'Low Stock', variant: 'warning' },
  out_of_stock: { label: 'Out of Stock', variant: 'danger' },
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'neutral' },

  // Documents (PO, Transfer, Adjustment)
  draft: { label: 'Draft', variant: 'neutral' },
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'brand' },
  partially_received: { label: 'Partial Receipt', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  rejected: { label: 'Rejected', variant: 'danger' },

  // Movement Types
  stock_in: { label: 'Stock In', variant: 'success' },
  purchase_receipt: { label: 'PO Receipt', variant: 'success' },
  stock_out: { label: 'Stock Out', variant: 'warning' },
  transfer_out: { label: 'Transfer Out', variant: 'brand' },
  transfer_in: { label: 'Transfer In', variant: 'brand' },
  adjustment_in: { label: 'Adj (+)', variant: 'success' },
  adjustment_out: { label: 'Adj (-)', variant: 'danger' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? {
    label: status.replace(/_/g, ' '),
    variant: 'neutral' as BadgeVariant,
  };

  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
