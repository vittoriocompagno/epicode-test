import { createFileRoute } from '@tanstack/react-router';
import { EyeIcon, FileCodeIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateTemplate,
  useDeleteTemplate,
  usePreviewTemplate,
  useTemplates,
  useUpdateTemplate,
} from '@/hooks/queries';
import type { TemplateResponse } from '@certificates/contracts';
import { EXAMPLE_CERTIFICATE_HTML, EXAMPLE_TEMPLATE_VARIABLES } from '@/lib/examples';
import { formatDateTime, formatShortId } from '@/lib/format';

export const Route = createFileRoute('/templates')({
  component: TemplatesPage,
});

type TemplateFormState = {
  name: string;
  description: string;
  html: string;
  variablesJson: string;
};

const emptyForm: TemplateFormState = {
  name: '',
  description: '',
  html: '',
  variablesJson: JSON.stringify(EXAMPLE_TEMPLATE_VARIABLES, null, 2),
};

function TemplatesPage() {
  const templates = useTemplates({ page: 1, pageSize: 100 });
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const previewTemplate = usePreviewTemplate();

  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selected, setSelected] = useState<TemplateResponse | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [previewHtml, setPreviewHtml] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const detectedVariables = useMemo(() => {
    const matches = form.html.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
    return [...new Set([...matches].map((match) => match[1]))];
  }, [form.html]);

  function openCreate() {
    setSelected(null);
    setForm(emptyForm);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(template: TemplateResponse) {
    setSelected(template);
    setForm({
      name: template.name,
      description: template.description ?? '',
      html: template.html,
      variablesJson: JSON.stringify(EXAMPLE_TEMPLATE_VARIABLES, null, 2),
    });
    setFormError(null);
    setEditorOpen(true);
  }

  function openDelete(template: TemplateResponse) {
    setSelected(template);
    setDeleteOpen(true);
  }

  function loadExample() {
    setForm((current) => ({
      ...current,
      name: current.name || 'Course completion certificate',
      description: current.description || 'Default certificate layout for course completions.',
      html: EXAMPLE_CERTIFICATE_HTML,
      variablesJson: JSON.stringify(EXAMPLE_TEMPLATE_VARIABLES, null, 2),
    }));
  }

  function parseVariables(): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(form.variablesJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setFormError('Variables must be a JSON object.');
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setFormError('Variables JSON is invalid.');
      return null;
    }
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim() || !form.html.trim()) {
      setFormError('Name and HTML are required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      html: form.html,
    };

    if (selected) {
      await updateTemplate.mutateAsync({ id: selected.id, body: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    setEditorOpen(false);
  }

  async function handlePreview() {
    setFormError(null);
    const variables = parseVariables();
    if (!variables) return;
    if (!form.name.trim() || !form.html.trim()) {
      setFormError('Name and HTML are required before preview.');
      return;
    }

    // Always preview through the API so Handlebars escaping matches production.
    let templateId = selected?.id;
    if (!templateId) {
      const created = await createTemplate.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        html: form.html,
      });
      templateId = created.id;
      setSelected(created);
    } else {
      await updateTemplate.mutateAsync({
        id: templateId,
        body: {
          name: form.name.trim(),
          description: form.description.trim() ? form.description.trim() : null,
          html: form.html,
        },
      });
    }

    const result = await previewTemplate.mutateAsync({
      id: templateId,
      body: { variables },
    });
    setPreviewHtml(result.html);
    setPreviewOpen(true);
  }

  async function handleDelete() {
    if (!selected) return;
    await deleteTemplate.mutateAsync(selected.id);
    setDeleteOpen(false);
    setSelected(null);
  }

  useEffect(() => {
    if (!editorOpen) {
      setPreviewHtml('');
    }
  }, [editorOpen]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create HTML certificate layouts with mustache-style variables.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <PlusIcon className="size-4" />
          New template
        </Button>
      </div>

      <QueryState
        isLoading={templates.isLoading}
        isError={templates.isError}
        error={templates.error}
        isEmpty={templates.data?.items.length === 0}
        emptyTitle="No templates yet"
        emptyDescription="Create a template to start generating certificates."
        onRetry={() => void templates.refetch()}
      >
        {templates.data ? (
          <div className="rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.data.items.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatShortId(template.id)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.slice(0, 4).map((variable) => (
                          <Badge key={variable} variant="secondary">
                            {variable}
                          </Badge>
                        ))}
                        {template.variables.length > 4 ? (
                          <Badge variant="outline">+{template.variables.length - 4}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(template.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(template)}
                        >
                          <FileCodeIcon className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openDelete(template)}
                        >
                          <Trash2Icon className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </QueryState>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit template' : 'Create template'}</DialogTitle>
            <DialogDescription>
              HTML supports <code>{'{{variable}}'}</code> placeholders. Preview renders in a sandboxed
              iframe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={loadExample}>
                <SparklesIcon className="size-3.5" />
                Load example certificate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePreview()}
                disabled={previewTemplate.isPending}
              >
                <EyeIcon className="size-3.5" />
                Preview
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-html">HTML</Label>
              <Textarea
                id="template-html"
                className="min-h-56 font-mono text-xs"
                value={form.html}
                onChange={(event) => setForm((current) => ({ ...current, html: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-variables">Sample variables (JSON)</Label>
              <Textarea
                id="template-variables"
                className="min-h-28 font-mono text-xs"
                value={form.variablesJson}
                onChange={(event) =>
                  setForm((current) => ({ ...current, variablesJson: event.target.value }))
                }
              />
            </div>

            {detectedVariables.length > 0 ? (
              <div className="space-y-2">
                <Label>Detected variables</Label>
                <div className="flex flex-wrap gap-1">
                  {detectedVariables.map((variable) => (
                    <Badge key={variable} variant="outline">
                      {variable}
                    </Badge>
                  ))}
                </div>
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
              disabled={createTemplate.isPending || updateTemplate.isPending}
            >
              {selected ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Template preview</DialogTitle>
            <DialogDescription>Sandboxed iframe preview of rendered HTML.</DialogDescription>
          </DialogHeader>
          <iframe
            sandbox=""
            srcDoc={previewHtml}
            title="Preview"
            className="h-[480px] w-full rounded-lg border border-border bg-white"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              Delete <strong>{selected?.name}</strong>? Existing documents keep their reference but
              new drafts cannot use this template.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteTemplate.isPending}
            >
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
