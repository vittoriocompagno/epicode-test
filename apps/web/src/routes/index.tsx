import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const healthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 15_000,
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Certificate Generator</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Foundation workspace for templates, documents, and bulk generation. Business features are
          intentionally deferred.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            API connectivity
          </p>
          {healthQuery.isLoading ? <Badge variant="secondary">Checking</Badge> : null}
          {healthQuery.isError ? <Badge variant="destructive">Offline</Badge> : null}
          {healthQuery.data ? <Badge>Healthy</Badge> : null}
        </div>
        <p className="mt-2 text-sm">
          Base URL: <code>{apiClient.baseUrl}</code>
        </p>
        {healthQuery.isError ? (
          <p className="mt-2 text-sm text-destructive">
            API unreachable. Start the API service and ensure infrastructure is running.
          </p>
        ) : null}
        {healthQuery.data ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {healthQuery.data.service} · {healthQuery.data.timestamp}
          </p>
        ) : null}
      </div>
    </section>
  );
}
