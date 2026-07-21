import { z } from 'zod';

export const MAX_TEMPLATE_NAME_LENGTH = 200;
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 2_000;
export const MAX_TEMPLATE_HTML_LENGTH = 100_000;
export const MAX_TEMPLATE_VARIABLES = 50;
export const MAX_DOCUMENT_VARIABLES_JSON_BYTES = 32_768;
export const MAX_PAGE_SIZE = 100;

export const UuidSchema = z.string().uuid();

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).default({}),
  }),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

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

export const TemplateResponseSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  html: z.string(),
  variables: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TemplateResponse = z.infer<typeof TemplateResponseSchema>;

export const TemplateListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
}).strict();

export type TemplateListQuery = z.infer<typeof TemplateListQuerySchema>;

export const PaginatedTemplatesSchema = z.object({
  items: z.array(TemplateResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginatedTemplates = z.infer<typeof PaginatedTemplatesSchema>;

export const DocumentStatusSchema = z.enum([
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

export const DocumentResponseSchema = z.object({
  id: UuidSchema,
  templateId: UuidSchema,
  variables: z.record(z.unknown()),
  status: DocumentStatusSchema,
  outputPath: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  emailTo: z.string().email().nullable(),
  emailStatus: z.enum(['pending', 'sent', 'failed', 'skipped']).nullable(),
  emailError: z.string().nullable(),
  emailedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  generatedAt: z.string().datetime().nullable(),
});

export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;

export const DocumentListQuerySchema = PaginationQuerySchema.extend({
  templateId: UuidSchema.optional(),
  status: DocumentStatusSchema.optional(),
}).strict();

export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;

export const PaginatedDocumentsSchema = z.object({
  items: z.array(DocumentResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginatedDocuments = z.infer<typeof PaginatedDocumentsSchema>;

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

export const PreviewResponseSchema = z.object({
  html: z.string(),
  variables: z.array(z.string()),
});

export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

export const GenerateAcceptedSchema = z.object({
  documentId: UuidSchema,
  status: z.enum(['queued', 'processing', 'completed']),
  jobId: z.string(),
});

export type GenerateAccepted = z.infer<typeof GenerateAcceptedSchema>;

export const DocumentStatusResponseSchema = z.object({
  documentId: UuidSchema,
  status: DocumentStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  generatedAt: z.string().datetime().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  emailStatus: z.enum(['pending', 'sent', 'failed', 'skipped']).nullable(),
});

export type DocumentStatusResponse = z.infer<typeof DocumentStatusResponseSchema>;

export const MAX_BATCH_ITEMS = 10_000;

export const CreateBatchItemSchema = z
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

export const BatchAcceptedSchema = z.object({
  batchId: UuidSchema,
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  total: z.number().int().nonnegative(),
});

export type BatchAccepted = z.infer<typeof BatchAcceptedSchema>;

export const BatchStatusResponseSchema = z.object({
  id: UuidSchema,
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  total: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export type BatchStatusResponse = z.infer<typeof BatchStatusResponseSchema>;

export const BatchListQuerySchema = PaginationQuerySchema.strict();

export type BatchListQuery = z.infer<typeof BatchListQuerySchema>;

export const PaginatedBatchesSchema = z.object({
  items: z.array(BatchStatusResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginatedBatches = z.infer<typeof PaginatedBatchesSchema>;

export const OverviewResponseSchema = z.object({
  api: HealthResponseSchema,
  templates: z.number().int().nonnegative(),
  documentsByStatus: z.object({
    draft: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  recentDocuments: z.array(DocumentResponseSchema),
  recentBatches: z.array(BatchStatusResponseSchema),
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;

/** Lightweight BullMQ payloads — never embed templates or PDF buffers. */
export const GenerateCertificateJobSchema = z.object({
  documentId: UuidSchema,
});

export type GenerateCertificateJob = z.infer<typeof GenerateCertificateJobSchema>;

export const DispatchBatchJobSchema = z.object({
  batchId: UuidSchema,
});

export type DispatchBatchJob = z.infer<typeof DispatchBatchJobSchema>;

export const JobPayloadSchema = z.union([GenerateCertificateJobSchema, DispatchBatchJobSchema]);

export type JobPayload = z.infer<typeof JobPayloadSchema>;
