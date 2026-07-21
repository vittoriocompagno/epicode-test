import type {
  AdHocPreviewRequest,
  BatchAccepted,
  BatchListQuery,
  BatchStatusResponse,
  CreateBatchInput,
  CreateDocumentInput,
  CreateTemplateInput,
  DocumentListQuery,
  DocumentResponse,
  DocumentStatusResponse,
  GenerateAccepted,
  HealthResponse,
  OverviewResponse,
  PaginatedBatches,
  PaginatedDocuments,
  PaginatedTemplates,
  PreviewRequest,
  PreviewResponse,
  TemplateListQuery,
  TemplateResponse,
  UpdateDocumentInput,
  UpdateTemplateInput,
} from '@certificates/contracts';
import { resolveApiBaseUrl } from './api-base-url.js';
import { ApiErrorBodySchema } from '@certificates/contracts';
import { getApiKey, notifyUnauthorized } from '@/lib/auth';

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  window.location.origin,
);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type FetchJsonOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  apiKey?: string;
  skipUnauthorized?: boolean;
};

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function buildHeaders(body?: unknown, extra?: HeadersInit, apiKeyOverride?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const apiKey = apiKeyOverride ?? getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return { ...headers, ...(extra as Record<string, string> | undefined) };
}

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body: unknown = await response.json();
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      return new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
  } catch {
    return new ApiClientError(response.status, 'UNKNOWN', response.statusText || 'Request failed');
  }
  return new ApiClientError(response.status, 'UNKNOWN', response.statusText || 'Request failed');
}

async function handleResponse<T>(
  response: Response,
  options?: { skipUnauthorized?: boolean },
): Promise<T> {
  if (response.status === 401) {
    if (!options?.skipUnauthorized) {
      notifyUnauthorized();
    }
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Invalid or missing API key');
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const { body, params, headers, apiKey, skipUnauthorized, ...rest } = options;
  const response = await fetch(buildUrl(path, params), {
    ...rest,
    headers: buildHeaders(body, headers, apiKey),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response, { skipUnauthorized });
}

export async function fetchBlob(path: string, options: FetchJsonOptions = {}): Promise<Blob> {
  const { body, params, headers, ...rest } = options;
  const response = await fetch(buildUrl(path, params), {
    ...rest,
    headers: buildHeaders(body, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Invalid or missing API key');
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.blob();
}

export const api = {
  getHealth: (apiKey?: string) => fetchJson<HealthResponse>('/health', { apiKey }),

  verifyApiKey: (apiKey: string) =>
    fetchJson<HealthResponse>('/health', { apiKey, skipUnauthorized: true }),

  getOverview: () => fetchJson<OverviewResponse>('/api/overview'),

  listTemplates: (params?: TemplateListQuery) =>
    fetchJson<PaginatedTemplates>('/api/templates', { params }),

  getTemplate: (templateId: string) => fetchJson<TemplateResponse>(`/api/templates/${templateId}`),

  createTemplate: (body: CreateTemplateInput) =>
    fetchJson<TemplateResponse>('/api/templates', { method: 'POST', body }),

  updateTemplate: (templateId: string, body: UpdateTemplateInput) =>
    fetchJson<TemplateResponse>(`/api/templates/${templateId}`, { method: 'PATCH', body }),

  deleteTemplate: (templateId: string) =>
    fetchJson<void>(`/api/templates/${templateId}`, { method: 'DELETE' }),

  previewTemplate: (templateId: string, body: PreviewRequest) =>
    fetchJson<PreviewResponse>(`/api/templates/${templateId}/preview`, { method: 'POST', body }),

  previewAdHoc: (body: AdHocPreviewRequest) =>
    fetchJson<PreviewResponse>('/api/templates/preview', { method: 'POST', body }),

  listDocuments: (params?: DocumentListQuery) =>
    fetchJson<PaginatedDocuments>('/api/documents', { params }),

  getDocument: (documentId: string) => fetchJson<DocumentResponse>(`/api/documents/${documentId}`),

  createDocument: (body: CreateDocumentInput) =>
    fetchJson<DocumentResponse>('/api/documents', { method: 'POST', body }),

  updateDocument: (documentId: string, body: UpdateDocumentInput) =>
    fetchJson<DocumentResponse>(`/api/documents/${documentId}`, { method: 'PATCH', body }),

  deleteDocument: (documentId: string) =>
    fetchJson<void>(`/api/documents/${documentId}`, { method: 'DELETE' }),

  generateDocument: (documentId: string) =>
    fetchJson<GenerateAccepted>(`/api/documents/${documentId}/generate`, { method: 'POST' }),

  retryDocument: (documentId: string) =>
    fetchJson<GenerateAccepted>(`/api/documents/${documentId}/retry`, { method: 'POST' }),

  getDocumentStatus: (documentId: string) =>
    fetchJson<DocumentStatusResponse>(`/api/documents/${documentId}/status`),

  downloadPdf: (documentId: string) => fetchBlob(`/api/documents/${documentId}/download`),

  listBatches: (params?: BatchListQuery) => fetchJson<PaginatedBatches>('/api/batches', { params }),

  getBatch: (batchId: string) => fetchJson<BatchStatusResponse>(`/api/batches/${batchId}`),

  createBatch: (body: CreateBatchInput) =>
    fetchJson<BatchAccepted>('/api/batches', { method: 'POST', body }),
};
