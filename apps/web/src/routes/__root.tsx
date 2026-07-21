import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ApiKeyScreen } from '@/components/api-key-screen';
import { AppShell } from '@/components/app-shell';
import { useApiKey } from '@/hooks/use-api-key';

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { hasApiKey } = useApiKey();

  if (!hasApiKey) {
    return <ApiKeyScreen />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
