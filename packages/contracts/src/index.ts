import { z } from 'zod';

const MAX_TEMPLATE_NAME_LENGTH = 200;
const MAX_TEMPLATE_DESCRIPTION_LENGTH = 2_000;
const MAX_TEMPLATE_HTML_LENGTH = 100_000;
const MAX_DOCUMENT_VARIABLES_JSON_BYTES = 32_768;
const MAX_PAGE_SIZE = 100;

type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type EmailStatus = 'pending' | 'sent' | 'failed' | 'skipped';
type BatchStatus = 'queued' | 'processing' | 'completed' | 'failed';

export const UuidSchema = z.string().uuid();

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const CreateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TEMPLATE_NAME_LENGTH),
    description: z
      .string()
      .trim()
      .max(MAX_TEMPLATE_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    html: z.string().min(1).max(MAX_TEMPLATE_HTML_LENGTH),
  })
  .strict();

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TEMPLATE_NAME_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .max(MAX_TEMPLATE_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    html: z.string().min(1).max(MAX_TEMPLATE_HTML_LENGTH).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

export type TemplateResponse = {
  id: string;
  name: string;
  description: string | null;
  html: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
};

export const TemplateListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
}).strict();

export type TemplateListQuery = z.infer<typeof TemplateListQuerySchema>;

export type PaginatedTemplates = Paginated<TemplateResponse>;

const DocumentStatusSchema = z.enum([
  'draft',
  'queued',
  'processing',
  'completed',
  'failed',
]);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

const DocumentVariablesSchema = z
  .record(z.unknown())
  .superRefine((value, ctx) => {
    const json = JSON.stringify(value);
    const size =
      typeof Buffer !== 'undefined'
        ? Buffer.byteLength(json, 'utf8')
        : new TextEncoder().encode(json).length;
    if (size > MAX_DOCUMENT_VARIABLES_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Document variables exceed ${MAX_DOCUMENT_VARIABLES_JSON_BYTES} bytes`,
      });
    }
  });

export const CreateDocumentSchema = z
  .object({
    templateId: UuidSchema,
    variables: DocumentVariablesSchema.default({}),
    emailTo: z.string().email().optional(),
  })
  .strict();

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = z
  .object({
    templateId: UuidSchema.optional(),
    variables: DocumentVariablesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;

export type DocumentResponse = {
  id: string;
  templateId: string;
  variables: Record<string, unknown>;
  status: DocumentStatus;
  outputPath: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  emailTo: string | null;
  emailStatus: EmailStatus | null;
  emailError: string | null;
  emailedAt: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
};

export const DocumentListQuerySchema = PaginationQuerySchema.extend({
  templateId: UuidSchema.optional(),
  status: DocumentStatusSchema.optional(),
}).strict();

export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;

export type PaginatedDocuments = Paginated<DocumentResponse>;

export const PreviewRequestSchema = z
  .object({
    variables: DocumentVariablesSchema.default({}),
  })
  .strict();

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

export const AdHocPreviewRequestSchema = z
  .object({
    html: z.string().min(1).max(MAX_TEMPLATE_HTML_LENGTH),
    variables: DocumentVariablesSchema.default({}),
  })
  .strict();

export type AdHocPreviewRequest = z.infer<typeof AdHocPreviewRequestSchema>;

export type PreviewResponse = {
  html: string;
  variables: string[];
};

export type GenerateAccepted = {
  documentId: string;
  status: 'queued' | 'processing' | 'completed';
  jobId: string;
};

export type DocumentStatusResponse = {
  documentId: string;
  status: DocumentStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  error: { code: string; message: string } | null;
  emailStatus: EmailStatus | null;
};

const MAX_BATCH_ITEMS = 10_000;

const CreateBatchItemSchema = z
  .object({
    variables: DocumentVariablesSchema,
    emailTo: z.string().email().optional(),
  })
  .strict();

export const CreateBatchSchema = z
  .object({
    templateId: UuidSchema,
    items: z.array(CreateBatchItemSchema).min(1).max(MAX_BATCH_ITEMS),
    emailTo: z.string().email().optional(),
  })
  .strict();

export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;

export type BatchAccepted = {
  batchId: string;
  status: BatchStatus;
  total: number;
};

export type BatchStatusResponse = {
  id: string;
  status: BatchStatus;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  pending: number;
  createdAt: string;
  completedAt: string | null;
};

export const BatchListQuerySchema = PaginationQuerySchema.strict();

export type BatchListQuery = z.infer<typeof BatchListQuerySchema>;

export type PaginatedBatches = Paginated<BatchStatusResponse>;

export type OverviewResponse = {
  api: HealthResponse;
  templates: number;
  documentsByStatus: Record<DocumentStatus, number>;
  recentDocuments: DocumentResponse[];
  recentBatches: BatchStatusResponse[];
};

const CorrelationIdSchema = z.string().min(1).max(128);

export const GenerateCertificateJobSchema = z.object({
  documentId: UuidSchema,
  correlationId: CorrelationIdSchema,
});

export type GenerateCertificateJob = z.infer<typeof GenerateCertificateJobSchema>;

export const DispatchBatchJobSchema = z.object({
  batchId: UuidSchema,
  correlationId: CorrelationIdSchema,
});

export type DispatchBatchJob = z.infer<typeof DispatchBatchJobSchema>;
