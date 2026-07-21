import { createFileRoute } from '@tanstack/react-router';
import { DownloadIcon, LayersIcon, UploadIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { QueryState } from '@/components/query-state';
import { StatusBadge } from '@/components/status-badge';
import { TemplateSelect } from '@/components/template-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useBatch, useBatches, useCreateBatch, useTemplates } from '@/hooks/queries';
import { downloadBlob } from '@/lib/download';
import { EXAMPLE_BATCH_ITEMS } from '@/lib/examples';
import { formatDateTime, formatShortId } from '@/lib/format';
import { parseBatchInput } from '@/lib/validation';

export const Route = createFileRoute('/bulk')({
  component: BulkPage,
});

function BulkPage() {
  const templates = useTemplates({ page: 1, pageSize: 100 });
  const batches = useBatches({ page: 1, pageSize: 20 });
  const createBatch = useCreateBatch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [templateId, setTemplateId] = useState('');
  const [itemsJson, setItemsJson] = useState(JSON.stringify(EXAMPLE_BATCH_ITEMS, null, 2));
  const [batchEmail, setBatchEmail] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const activeBatch = useBatch(activeBatchId ?? '', Boolean(activeBatchId));

  const parsedSummary = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(itemsJson);
      if (!Array.isArray(parsed)) return { valid: false, count: 0 };
      return { valid: true, count: parsed.length };
    } catch {
      return { valid: false, count: 0 };
    }
  }, [itemsJson]);

  function downloadExample() {
    downloadBlob(
      new Blob([JSON.stringify(EXAMPLE_BATCH_ITEMS, null, 2)], { type: 'application/json' }),
      'batch-items.example.json',
    );
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setItemsJson(text);
    event.target.value = '';
  }

  async function handleCreateBatch() {
    setFormError(null);
    const result = parseBatchInput(templateId, itemsJson, batchEmail);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    try {
      const accepted = await createBatch.mutateAsync(result.data);
      setActiveBatchId(accepted.batchId);
      void batches.refetch();
    } catch {
      return;
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Bulk generation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Queue thousands of certificates without rendering every row in the browser.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Create batch</CardTitle>
            <CardDescription>
              Upload or paste an array of <code>{'{ "variables": { ... } }'}</code> items.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TemplateSelect
              id="batch-template"
              value={templateId}
              onValueChange={setTemplateId}
              templates={templates.data?.items ?? []}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="batch-items">Items JSON</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={downloadExample}>
                    <DownloadIcon className="size-3.5" />
                    Example
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadIcon className="size-3.5" />
                    Upload JSON
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => void handleFileUpload(event)}
                  />
                </div>
              </div>
              <Textarea
                id="batch-items"
                className="min-h-64 font-mono text-xs"
                value={itemsJson}
                onChange={(event) => setItemsJson(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {parsedSummary.valid
                  ? `${parsedSummary.count.toLocaleString()} items ready`
                  : 'Invalid JSON array'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch-email">Default email (optional)</Label>
              <Input
                id="batch-email"
                type="email"
                placeholder="recipient@example.com"
                value={batchEmail}
                onChange={(event) => setBatchEmail(event.target.value)}
              />
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <Button
              type="button"
              onClick={() => void handleCreateBatch()}
              disabled={createBatch.isPending || !parsedSummary.valid}
            >
              <LayersIcon className="size-4" />
              Create batch
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active batch</CardTitle>
            <CardDescription>Polls while status is queued or processing.</CardDescription>
          </CardHeader>
          <CardContent>
            {!activeBatchId ? (
              <p className="text-sm text-muted-foreground">Submit a batch to track progress here.</p>
            ) : (
              <QueryState
                isLoading={activeBatch.isLoading}
                isError={activeBatch.isError}
                error={activeBatch.error}
                onRetry={() => void activeBatch.refetch()}
              >
                {activeBatch.data ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs">{formatShortId(activeBatch.data.id)}</p>
                      <StatusBadge status={activeBatch.data.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <BatchStat label="Total" value={activeBatch.data.total} />
                      <BatchStat label="Pending" value={activeBatch.data.pending} />
                      <BatchStat label="Queued" value={activeBatch.data.queued} />
                      <BatchStat label="Processing" value={activeBatch.data.processing} />
                      <BatchStat label="Completed" value={activeBatch.data.completed} />
                      <BatchStat label="Failed" value={activeBatch.data.failed} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDateTime(activeBatch.data.createdAt)}
                      {activeBatch.data.completedAt
                        ? ` · Completed ${formatDateTime(activeBatch.data.completedAt)}`
                        : ''}
                    </p>
                  </div>
                ) : null}
              </QueryState>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent batches</CardTitle>
          <CardDescription>Summary counts only — individual rows are not rendered.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={batches.isLoading}
            isError={batches.isError}
            error={batches.error}
            isEmpty={batches.data?.items.length === 0}
            emptyTitle="No batches yet"
            emptyDescription="Create a batch to see it listed here."
            onRetry={() => void batches.refetch()}
          >
            {batches.data ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.data.items.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-xs">{formatShortId(batch.id)}</TableCell>
                      <TableCell>
                        <StatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {batch.completed}/{batch.total} completed · {batch.failed} failed
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(batch.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveBatchId(batch.id)}
                        >
                          Track
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </QueryState>
        </CardContent>
      </Card>
    </section>
  );
}

function BatchStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
