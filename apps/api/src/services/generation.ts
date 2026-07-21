import type {
  DocumentStatusResponse,
  GenerateAccepted,
} from '@certificates/contracts';
import type { Database } from '@certificates/database';
import { getByPath } from '@certificates/rendering';
import {
  enqueueCertificateGeneration,
  type CertificateQueue,
} from '@certificates/queue';
import type { DocumentStorage } from '@certificates/storage';
import { AppError } from '../errors.js';
import { DocumentRepository } from '../repositories/documents.js';
import { TemplateRepository } from '../repositories/templates.js';

export class GenerationService {
  private readonly documents: DocumentRepository;
  private readonly templates: TemplateRepository;

  constructor(
    db: Database,
    private readonly certificateQueue: CertificateQueue,
    private readonly storage: DocumentStorage,
  ) {
    this.documents = new DocumentRepository(db);
    this.templates = new TemplateRepository(db);
  }

  async generate(documentId: string): Promise<GenerateAccepted> {
    const document = await this.requireDocument(documentId);
    const template = await this.templates.findById(document.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    this.assertVariablesPresent(template.variables, document.variables);

    if (document.status === 'completed') {
      return {
        documentId: document.id,
        status: 'completed',
        jobId: `generate-${document.id}`,
      };
    }

    if (document.status === 'queued' || document.status === 'processing') {
      return {
        documentId: document.id,
        status: document.status,
        jobId: `generate-${document.id}`,
      };
    }

    if (document.status !== 'draft' && document.status !== 'failed') {
      throw new AppError(409, 'DOCUMENT_NOT_GENERATABLE', 'Document cannot be generated', {
        status: document.status,
      });
    }

    const queued = await this.documents.markQueued(document.id, ['draft', 'failed']);
    if (!queued) {
      const latest = await this.requireDocument(documentId);
      return {
        documentId: latest.id,
        status: latest.status === 'completed' ? 'completed' : latest.status === 'processing' ? 'processing' : 'queued',
        jobId: `generate-${latest.id}`,
      };
    }

    await this.removeFinishedCertificateJob(document.id);
    const jobId = await enqueueCertificateGeneration(this.certificateQueue, document.id);
    return {
      documentId: queued.id,
      status: 'queued',
      jobId,
    };
  }

  async retry(documentId: string): Promise<GenerateAccepted> {
    const document = await this.requireDocument(documentId);
    if (document.status !== 'failed') {
      throw new AppError(409, 'DOCUMENT_NOT_RETRYABLE', 'Only failed documents can be retried', {
        status: document.status,
      });
    }

    const template = await this.templates.findById(document.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }
    this.assertVariablesPresent(template.variables, document.variables);

    const queued = await this.documents.markQueued(document.id, ['failed']);
    if (!queued) {
      throw new AppError(409, 'DOCUMENT_NOT_RETRYABLE', 'Document is no longer failed');
    }

    await this.removeFinishedCertificateJob(document.id);
    const jobId = await enqueueCertificateGeneration(this.certificateQueue, document.id);
    return {
      documentId: queued.id,
      status: 'queued',
      jobId,
    };
  }

  async status(documentId: string): Promise<DocumentStatusResponse> {
    const document = await this.requireDocument(documentId);
    return {
      documentId: document.id,
      status: document.status,
      attempts: document.attemptCount,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      generatedAt: document.generatedAt,
      error:
        document.errorCode && document.errorMessage
          ? { code: document.errorCode, message: document.errorMessage }
          : null,
      emailStatus: document.emailStatus,
    };
  }

  async download(documentId: string): Promise<{ body: Buffer; filename: string }> {
    const document = await this.requireDocument(documentId);
    if (document.status !== 'completed' || !document.outputPath) {
      throw new AppError(409, 'DOCUMENT_NOT_READY', 'Document PDF is not available for download', {
        status: document.status,
      });
    }

    const exists = await this.storage.exists(document.outputPath);
    if (!exists) {
      throw new AppError(404, 'STORAGE_OBJECT_MISSING', 'Generated PDF is missing from storage');
    }

    const body = await this.storage.get(document.outputPath);
    return {
      body,
      filename: `certificate-${document.id}.pdf`,
    };
  }

  private async removeFinishedCertificateJob(documentId: string): Promise<void> {
    const existing = await this.certificateQueue.getJob(`generate-${documentId}`);
    if (!existing) {
      return;
    }
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') {
      await existing.remove();
    }
  }

  private async requireDocument(documentId: string) {
    const document = await this.documents.findById(documentId);
    if (!document) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
    return document;
  }

  private assertVariablesPresent(
    required: string[],
    variables: Record<string, unknown>,
  ): void {
    const missing = required.filter((path) => getByPath(variables, path) === undefined);
    if (missing.length > 0) {
      throw new AppError(422, 'MISSING_VARIABLES', 'Document is missing required variables', {
        missing,
      });
    }
  }
}
