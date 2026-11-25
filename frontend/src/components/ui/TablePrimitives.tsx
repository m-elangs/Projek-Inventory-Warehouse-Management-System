import React from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { PaginationMeta } from '@/types/domain';
import { Button } from './Button';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3.5">
      <div>
        <h1 className="text-[18px] sm:text-[19px] font-semibold tracking-tight text-ink leading-tight">{title}</h1>
        {description && <p className="text-[12px] sm:text-[13px] text-ink-secondary mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Pagination({
  meta,
  onPageChange,
}: {
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (!meta || meta.total === 0) return null;

  const start = (meta.current_page - 1) * meta.per_page + 1;
  const end = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 border-t border-line bg-surface text-[13px] text-ink-secondary">
      <div className="tabular-nums">
        Showing <span className="font-medium text-ink">{start}</span> to{' '}
        <span className="font-medium text-ink">{end}</span> of{' '}
        <span className="font-medium text-ink">{meta.total}</span> records
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.current_page <= 1}
          onClick={() => onPageChange(meta.current_page - 1)}
          leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Previous
        </Button>
        <span className="px-2.5 py-1 text-xs font-medium text-ink tabular-nums">
          Page {meta.current_page} / {meta.last_page}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.current_page >= meta.last_page}
          onClick={() => onPageChange(meta.current_page + 1)}
        >
          Next
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="w-10 h-10 rounded-md border border-line bg-canvas text-ink-secondary flex items-center justify-center mx-auto mb-3">
        {icon ?? <Inbox className="w-5 h-5" />}
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-[13px] text-ink-secondary max-w-md mx-auto mt-1">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <tbody className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="animate-pulse">
          {Array.from({ length: columns }).map((__, cIdx) => (
            <td key={cIdx} className="px-3.5 py-3">
              <div className="h-3.5 bg-canvas rounded w-4/5" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
