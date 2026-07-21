import { useCallback, useSyncExternalStore } from 'react';
import {
  clearApiKey,
  getApiKey,
  getAuthState,
  setApiKey,
  subscribeApiKey,
  UNAUTHORIZED_EVENT,
  type AuthState,
} from '@/lib/auth';

function subscribe(listener: () => void) {
  const onUnauthorized = () => listener();
  const unsubscribe = subscribeApiKey(listener);
  window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  return () => {
    unsubscribe();
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  };
}

export function useApiKey() {
  const authState = useSyncExternalStore(subscribe, getAuthState, (): AuthState => 'anonymous');

  return {
    authState,
    isAuthenticated: authState === 'authenticated',
    apiKey: authState === 'authenticated' ? getApiKey() : null,
    setApiKey: useCallback((key: string) => setApiKey(key), []),
    clearApiKey: useCallback(() => clearApiKey(), []),
  };
}
