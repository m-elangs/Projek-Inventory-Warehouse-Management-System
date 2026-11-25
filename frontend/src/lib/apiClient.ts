import { useAuthStore } from '@/stores/authStore';
import { generateIdempotencyKey } from '@/lib/formatters';
import type { ApiSuccessResponse, PaginatedResult } from '@/types/domain';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  public readonly status: number;
  public readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function buildQueryString(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, String(val));
    }
  });
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccessResponse<T>> {
  const { method = 'GET', body, params, idempotencyKey } = options;
  const token = useAuthStore.getState().token;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET' && method !== 'DELETE') {
    headers['X-Idempotency-Key'] = idempotencyKey || generateIdempotencyKey();
  }

  const response = await fetch(`${API_BASE}${path}${buildQueryString(params)}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (response.status === 401 && path !== '/auth/login') {
    useAuthStore.getState().clearSession();
  }

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || json.success === false) {
    const message = json?.message || `Request failed with status ${response.status}`;
    const errors = (json?.errors && typeof json.errors === 'object' ? json.errors : {}) as Record<string, string[]>;
    throw new ApiError(message, response.status, errors);
  }

  return json as ApiSuccessResponse<T>;
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    const res = await rawRequest<T>(path, { method: 'GET', params });
    return res.data;
  },

  async getPaginated<T>(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>
  ): Promise<PaginatedResult<T>> {
    const res = await rawRequest<T[]>(path, { method: 'GET', params });
    return {
      items: res.data,
      meta: res.meta ?? {
        current_page: 1,
        per_page: res.data.length || 15,
        total: res.data.length,
        last_page: 1,
      },
    };
  },

  async post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const res = await rawRequest<T>(path, { method: 'POST', body, idempotencyKey });
    return res.data;
  },

  async put<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const res = await rawRequest<T>(path, { method: 'PUT', body, idempotencyKey });
    return res.data;
  },

  async delete<T = null>(path: string): Promise<T> {
    const res = await rawRequest<T>(path, { method: 'DELETE' });
    return res.data;
  },

  async downloadCsv(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
    fallbackFilename = 'report.csv'
  ): Promise<void> {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_BASE}${path}${buildQueryString(params)}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new ApiError('Failed to export CSV report.', response.status);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || fallbackFilename;

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
};
