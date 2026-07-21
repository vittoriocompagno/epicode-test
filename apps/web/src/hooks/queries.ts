import type {
  AdHocPreviewRequest,
  BatchListQuery,
  CreateBatchInput,
  CreateDocumentInput,
  CreateTemplateInput,
  DocumentListQuery,
  PreviewRequest,
  TemplateListQuery,
  UpdateDocumentInput,
  UpdateTemplateInput,
} from '@certificates/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import {
  hasActiveBatchItems,
  hasActiveBatches,
  hasActiveDocumentItems,
  hasActiveDocuments,
  hasActiveWork,
  pollWhileActive,
} from '@/lib/polling';

export const queryKeys = {
  overview: ['overview'] as const,
  templates: (params?: TemplateListQuery) => ['templates', params] as const,
  template: (id: string) => ['templates', id] as const,
  documents: (params?: DocumentListQuery) => ['documents', params] as const,
  document: (id: string) => ['documents', id] as const,
  batches: (params?: BatchListQuery) => ['batches', params] as const,
  batch: (id: string) => ['batches', id] as const,
};

function mutationError(error: unknown, fallback: string) {
  const message = error instanceof ApiClientError ? error.message : fallback;
  toast.error(message);
}

function getOverviewData(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.getQueryData<Awaited<ReturnType<typeof api.getOverview>>>(
    queryKeys.overview,
  );
}

export function useOverview(enabled = true) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => api.getOverview(),
    enabled,
    refetchInterval: (query) => pollWhileActive(hasActiveWork(query.state.data)),
  });
}

export function useTemplates(params?: TemplateListQuery) {
  return useQuery({
    queryKey: queryKeys.templates(params),
    queryFn: () => api.listTemplates(params),
  });
}

export function useDocuments(params?: DocumentListQuery) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.documents(params),
    queryFn: () => api.listDocuments(params),
    refetchInterval: (query) => {
      const overview = getOverviewData(queryClient);
      const pageActive = hasActiveDocumentItems(query.state.data?.items);
      const overviewActive = hasActiveDocuments(overview);
      return pollWhileActive(pageActive || overviewActive);
    },
  });
}

export function useBatches(params?: BatchListQuery) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.batches(params),
    queryFn: () => api.listBatches(params),
    refetchInterval: (query) => {
      const overview = getOverviewData(queryClient);
      const pageActive = hasActiveBatchItems(query.state.data?.items);
      const overviewActive = hasActiveBatches(overview);
      return pollWhileActive(pageActive || overviewActive);
    },
  });
}

export function useBatch(batchId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.batch(batchId),
    queryFn: () => api.getBatch(batchId),
    enabled: enabled && Boolean(batchId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return pollWhileActive(status === 'queued' || status === 'processing');
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateInput) => api.createTemplate(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Template created');
    },
    onError: (error) => mutationError(error, 'Failed to create template'),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTemplateInput }) =>
      api.updateTemplate(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.template(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Template updated');
    },
    onError: (error) => mutationError(error, 'Failed to update template'),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Template deleted');
    },
    onError: (error) => mutationError(error, 'Failed to delete template'),
  });
}

export function usePreviewAdHoc() {
  return useMutation({
    mutationFn: (body: AdHocPreviewRequest) => api.previewAdHoc(body),
    onError: (error) => mutationError(error, 'Failed to preview template'),
  });
}

export function usePreviewTemplate() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PreviewRequest }) =>
      api.previewTemplate(id, body),
    onError: (error) => mutationError(error, 'Failed to preview template'),
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDocumentInput) => api.createDocument(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Draft document created');
    },
    onError: (error) => mutationError(error, 'Failed to create document'),
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDocumentInput }) =>
      api.updateDocument(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.document(id) });
      toast.success('Document updated');
    },
    onError: (error) => mutationError(error, 'Failed to update document'),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Document deleted');
    },
    onError: (error) => mutationError(error, 'Failed to delete document'),
  });
}

export function useGenerateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generateDocument(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.document(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Generation queued');
    },
    onError: (error) => mutationError(error, 'Failed to queue generation'),
  });
}

export function useRetryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryDocument(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.document(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success('Retry queued');
    },
    onError: (error) => mutationError(error, 'Failed to retry document'),
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (id: string) => {
      const blob = await api.downloadPdf(id);
      downloadBlob(blob, `certificate-${id.slice(0, 8)}.pdf`);
    },
    onSuccess: () => toast.success('Download started'),
    onError: (error) => mutationError(error, 'Failed to download PDF'),
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBatchInput) => api.createBatch(body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['batches'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      toast.success(`Batch queued (${data.total} items)`);
    },
    onError: (error) => mutationError(error, 'Failed to create batch'),
  });
}
