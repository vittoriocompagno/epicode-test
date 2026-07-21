import { z } from 'zod';

/** Placeholder API health contract shared by web and API. */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Placeholder job payload for future certificate generation. */
export const GenerateCertificateJobSchema = z.object({
  jobType: z.literal('generate-certificate'),
  documentId: z.string().uuid(),
  templateId: z.string().uuid(),
  requestedAt: z.string().datetime(),
});

export type GenerateCertificateJob = z.infer<typeof GenerateCertificateJobSchema>;

/** Placeholder bulk generation job payload. */
export const BulkGenerateJobSchema = z.object({
  jobType: z.literal('bulk-generate'),
  batchId: z.string().uuid(),
  requestedAt: z.string().datetime(),
});

export type BulkGenerateJob = z.infer<typeof BulkGenerateJobSchema>;

export const JobPayloadSchema = z.discriminatedUnion('jobType', [
  GenerateCertificateJobSchema,
  BulkGenerateJobSchema,
]);

export type JobPayload = z.infer<typeof JobPayloadSchema>;
