import type { HealthResponse } from '@certificates/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiError(`API request failed: ${response.statusText}`, response.status);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  baseUrl: API_BASE_URL,
  getHealth: () => request<HealthResponse>('/health'),
};
