import { useCallback, useSyncExternalStore } from 'react';
import {
  clearApiKey,
  getApiKey,
  setApiKey,
  subscribeApiKey,
  UNAUTHORIZED_EVENT,
} from '@/lib/auth';

function subscribe(listener: () => void) {
  const onStorage = () => listener();
  const onUnauthorized = () => listener();
  const unsubscribe = subscribeApiKey(listener);
  window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  window.addEventListener('storage', onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    window.removeEventListener('storage', onStorage);
  };
}

export function useApiKey() {
  const apiKey = useSyncExternalStore(subscribe, getApiKey, () => null);

  return {
    apiKey,
    hasApiKey: Boolean(apiKey),
    setApiKey: useCallback((key: string) => setApiKey(key), []),
    clearApiKey: useCallback(() => clearApiKey(), []),
  };
}
