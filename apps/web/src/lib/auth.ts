const STORAGE_KEY = 'certificates.apiKey';

const listeners = new Set<() => void>();

let verifying = false;
let queryClientClear: (() => void) | null = null;

export type AuthState = 'anonymous' | 'verifying' | 'authenticated';

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function registerQueryClientClear(fn: () => void): void {
  queryClientClear = fn;
}

function clearQueryCache(): void {
  queryClientClear?.();
}

export function subscribeApiKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getAuthState(): AuthState {
  if (verifying) return 'verifying';
  if (getApiKey()) return 'authenticated';
  return 'anonymous';
}

export function setVerifying(value: boolean): void {
  verifying = value;
  emitChange();
}

export function setApiKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key.trim());
  emitChange();
}

export function clearApiKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  verifying = false;
  clearQueryCache();
  emitChange();
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

export const UNAUTHORIZED_EVENT = 'certificates:unauthorized';

export function notifyUnauthorized(): void {
  clearApiKey();
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}
