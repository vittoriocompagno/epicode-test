import { createFileRoute, Link } from '@tanstack/react-router';
import { ActivityIcon, FileStackIcon, LayersIcon } from 'lucide-react';
import { QueryState } from '@/components/query-state';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOverview } from '@/hooks/queries';
import { formatDateTime, formatShortId } from '@/lib/format';

export const Route = createFileRoute('/')({
  component: OverviewPage,
});

function OverviewPage() {
  const overview = useOverview();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System health, inventory counts, and recent activity.
        </p>
      </div>

      <QueryState
        isLoading={overview.isLoading}
        isError={overview.isError}
        error={overview.error}
        onRetry={() => void overview.refetch()}
      >
        {overview.data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Templates"
                value={overview.data.templates}
                description="Registered HTML templates"
                icon={<LayersIcon className="size-4" />}
              />
              <MetricCard
                title="API status"
                value={overview.data.api.status === 'ok' ? 'Online' : 'Unknown'}
                description={`Last check ${formatDateTime(overview.data.api.timestamp)}`}
                icon={<ActivityIcon className="size-4" />}
              />
              <MetricCard
                title="Completed documents"
                value={overview.data.documentsByStatus.completed}
                description={`${overview.data.documentsByStatus.failed} failed`}
                icon={<FileStackIcon className="size-4" />}
              />
              <MetricCard
                title="In pipeline"
                value={
                  overview.data.documentsByStatus.queued +
                  overview.data.documentsByStatus.processing
                }
                description={`${overview.data.documentsByStatus.draft} drafts waiting`}
                icon={<ActivityIcon className="size-4" />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent documents</CardTitle>
                  <CardDescription>Latest certificate jobs across all templates.</CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.data.recentDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.data.recentDocuments.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <Link
                                to="/documents"
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {formatShortId(doc.id)}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={doc.status} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateTime(doc.updatedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent batches</CardTitle>
                  <CardDescription>Bulk generation runs and their progress.</CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.data.recentBatches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No batches yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Progress</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.data.recentBatches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell>
                              <Link
                                to="/bulk"
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {formatShortId(batch.id)}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={batch.status} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {batch.completed}/{batch.total} done
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </QueryState>
    </section>
  );
}

type MetricCardProps = {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
};

function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
