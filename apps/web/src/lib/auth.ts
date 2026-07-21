const STORAGE_KEY = 'certificates.apiKey';

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
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

export function setApiKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key.trim());
  emitChange();
}

export function clearApiKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
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
