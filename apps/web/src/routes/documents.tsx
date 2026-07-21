import { createFileRoute } from '@tanstack/react-router';
import {
  DownloadIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { JsonObjectField } from '@/components/json-object-field';
import { QueryState } from '@/components/query-state';
import { StatusBadge } from '@/components/status-badge';
import { TemplateSelect } from '@/components/template-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCreateDocument,
  useDeleteDocument,
  useDocuments,
  useDownloadDocument,
  useGenerateDocument,
  useRetryDocument,
  useTemplates,
  useUpdateDocument,
} from '@/hooks/queries';
import type { DocumentResponse, DocumentStatus } from '@certificates/contracts';
import { EXAMPLE_TEMPLATE_VARIABLES } from '@/lib/examples';
import { formatDateTime, formatShortId, sanitizeErrorMessage } from '@/lib/format';
import { parseVariables } from '@/lib/validation';

export const Route = createFileRoute('/documents')({
  component: DocumentsPage,
});

const STATUS_OPTIONS: Array<DocumentStatus | 'all'> = [
  'all',
  'draft',
  'queued',
  'processing',
  'completed',
  'failed',
];

type DocumentFormState = {
  templateId: string;
  variablesJson: string;
  emailTo: string;
};

function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DocumentStatus | 'all'>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(status !== 'all' ? { status } : {}),
      ...(templateFilter !== 'all' ? { templateId: templateFilter } : {}),
    }),
    [page, status, templateFilter],
  );

  const documents = useDocuments(queryParams);
  const templates = useTemplates({ page: 1, pageSize: 100 });
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();
  const generateDocument = useGenerateDocument();
  const retryDocument = useRetryDocument();
  const downloadDocument = useDownloadDocument();

  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentResponse | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocumentFormState>({
    templateId: '',
    variablesJson: JSON.stringify(EXAMPLE_TEMPLATE_VARIABLES, null, 2),
    emailTo: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const template of templates.data?.items ?? []) {
      map.set(template.id, template.name);
    }
    return map;
  }, [templates.data?.items]);

  function openCreate() {
    const defaultTemplateId = templates.data?.items[0]?.id ?? '';
    setSelected(null);
    setForm({
      templateId: defaultTemplateId,
      variablesJson: JSON.stringify(EXAMPLE_TEMPLATE_VARIABLES, null, 2),
      emailTo: '',
    });
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(document: DocumentResponse) {
    setSelected(document);
    setForm({
      templateId: document.templateId,
      variablesJson: JSON.stringify(document.variables, null, 2),
      emailTo: document.emailTo ?? '',
    });
    setFormError(null);
    setEditorOpen(true);
  }

  function openDelete(document: DocumentResponse) {
    setSelected(document);
    setDeleteOpen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!form.templateId) {
      setFormError('Select a template.');
      return;
    }
    const parsed = parseVariables(form.variablesJson);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }

    const onSuccess = () => setEditorOpen(false);
    if (selected) {
      updateDocument.mutate(
        { id: selected.id, body: { templateId: form.templateId, variables: parsed.data } },
        { onSuccess },
      );
    } else {
      createDocument.mutate(
        {
          templateId: form.templateId,
          variables: parsed.data,
          ...(form.emailTo.trim() ? { emailTo: form.emailTo.trim() } : {}),
        },
        { onSuccess },
      );
    }
  }

  function handleDelete() {
    if (!selected) return;
    deleteDocument.mutate(selected.id, {
      onSuccess: () => setDeleteOpen(false),
    });
  }

  function handleGenerate(documentId: string) {
    setGeneratingId(documentId);
    generateDocument.mutate(documentId, {
      onSettled: () => setGeneratingId(null),
    });
  }

  function handleRetry(documentId: string) {
    setRetryingId(documentId);
    retryDocument.mutate(documentId, {
      onSettled: () => setRetryingId(null),
    });
  }

  function handleDownload(documentId: string) {
    setDownloadingId(documentId);
    downloadDocument.mutate(documentId, {
      onSettled: () => setDownloadingId(null),
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft, generate, retry, and download certificate PDFs.
          </p>
        </div>
        <Button type="button" onClick={openCreate} disabled={!templates.data?.items.length}>
          <PlusIcon className="size-4" />
          New draft
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-2">
          <Label htmlFor="status-filter">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as DocumentStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger id="status-filter" className="w-full min-w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'All statuses' : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="template-filter">Template</Label>
          <Select
            value={templateFilter}
            onValueChange={(value) => {
              setTemplateFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger id="template-filter" className="w-full min-w-48">
              <SelectValue placeholder="All templates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {(templates.data?.items ?? []).map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QueryState
        isLoading={documents.isLoading}
        isError={documents.isError}
        error={documents.error}
        isEmpty={documents.data?.items.length === 0}
        emptyTitle="No documents found"
        emptyDescription="Create a draft or adjust your filters."
        onRetry={() => void documents.refetch()}
      >
        {documents.data ? (
          <>
            <div className="rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.data.items.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>
                        <div>
                          <p className="font-mono text-xs">{formatShortId(document.id)}</p>
                          {document.errorMessage ? (
                            <p className="mt-1 max-w-xs truncate text-xs text-destructive">
                              {sanitizeErrorMessage(document.errorMessage)}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {templateNameById.get(document.templateId) ?? formatShortId(document.templateId)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={document.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(document.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DocumentActions
                          document={document}
                          onEdit={() => openEdit(document)}
                          onDelete={() => openDelete(document)}
                          onGenerate={() => void handleGenerate(document.id)}
                          onRetry={() => void handleRetry(document.id)}
                          onDownload={() => void handleDownload(document.id)}
                          isGenerating={generatingId === document.id}
                          isRetrying={retryingId === document.id}
                          isDownloading={downloadingId === document.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {documents.data.page} of {Math.max(documents.data.totalPages, 1)} ·{' '}
                {documents.data.total} total
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= documents.data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </QueryState>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit draft' : 'Create draft'}</DialogTitle>
            <DialogDescription>
              Variables are merged into the selected template at generation time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <TemplateSelect
              id="document-template"
              value={form.templateId}
              onValueChange={(templateId) => setForm((current) => ({ ...current, templateId }))}
              templates={templates.data?.items ?? []}
            />

            <JsonObjectField
              id="document-variables"
              label="Variables (JSON)"
              value={form.variablesJson}
              onChange={(variablesJson) => setForm((current) => ({ ...current, variablesJson }))}
              minHeight="min-h-40"
            />

            {!selected ? (
              <div className="space-y-2">
                <Label htmlFor="document-email">Email (optional)</Label>
                <Input
                  id="document-email"
                  type="email"
                  placeholder="recipient@example.com"
                  value={form.emailTo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emailTo: event.target.value }))
                  }
                />
              </div>
            ) : null}

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={createDocument.isPending || updateDocument.isPending}
            >
              {selected ? 'Save draft' : 'Create draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete document"
        description={
          <>
            Permanently delete draft{' '}
            <code>{selected ? formatShortId(selected.id) : ''}</code>?
          </>
        }
        confirmLabel="Delete document"
        isPending={deleteDocument.isPending}
        onConfirm={handleDelete}
      />
    </section>
  );
}

type DocumentActionsProps = {
  document: DocumentResponse;
  onEdit: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  onRetry: () => void;
  onDownload: () => void;
  isGenerating: boolean;
  isRetrying: boolean;
  isDownloading: boolean;
};

function DocumentActions({
  document,
  onEdit,
  onDelete,
  onGenerate,
  onRetry,
  onDownload,
  isGenerating,
  isRetrying,
  isDownloading,
}: DocumentActionsProps) {
  return (
    <div className="flex justify-end gap-1">
      {document.status === 'draft' ? (
        <>
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <PencilIcon className="size-3.5" />
            Edit
          </Button>
          <Button type="button" size="sm" onClick={onGenerate} disabled={isGenerating}>
            <PlayIcon className="size-3.5" />
            Generate
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDelete}>
            <Trash2Icon className="size-3.5" />
          </Button>
        </>
      ) : null}
      {document.status === 'failed' ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={isRetrying}>
          <RefreshCwIcon className="size-3.5" />
          Retry
        </Button>
      ) : null}
      {document.status === 'completed' ? (
        <Button type="button" size="sm" variant="outline" onClick={onDownload} disabled={isDownloading}>
          <DownloadIcon className="size-3.5" />
          PDF
        </Button>
      ) : null}
    </div>
  );
}
