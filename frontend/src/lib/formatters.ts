import { Intl } from './intlShim';

const currencyFormatter = new globalThis.Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const integerFormatter = new globalThis.Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string | null | undefined, currencyCode?: string): string {
  const numeric = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;

  if (currencyCode && currencyCode !== 'IDR') {
    try {
      return new globalThis.Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(safeValue);
    } catch {
      return `${currencyCode} ${safeValue.toLocaleString('id-ID')}`;
    }
  }

  return currencyFormatter.format(safeValue);
}

export function formatNumber(value: number | string | null | undefined): string {
  const numeric = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return integerFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatSignedQuantity(value: number): string {
  if (value > 0) return `+${integerFormatter.format(value)}`;
  return integerFormatter.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

void Intl;
