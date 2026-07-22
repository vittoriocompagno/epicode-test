import type {
  DocumentStatus,
  DocumentStatusResponse,
  GenerateAccepted,
} from '@certificates/contracts';
import { markDocumentQueued, type Database } from '@certificates/database';
import { findMissingVariables } from '@certificates/rendering';
import {
  certificateJobId,
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
    private readonly db: Database,
    private readonly certificateQueue: CertificateQueue,
    private readonly storage: DocumentStorage,
  ) {
    this.documents = new DocumentRepository(db);
    this.templates = new TemplateRepository(db);
  }

  async generate(documentId: string): Promise<GenerateAccepted> {
    return this.enqueue(documentId, 'generate');
  }

  async retry(documentId: string): Promise<GenerateAccepted> {
    return this.enqueue(documentId, 'retry');
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

  private async enqueue(
    documentId: string,
    intent: 'generate' | 'retry',
  ): Promise<GenerateAccepted> {
    const allowedFrom: DocumentStatus[] = intent === 'retry' ? ['failed'] : ['draft', 'failed'];
    const notAllowedCode =
      intent === 'retry' ? 'DOCUMENT_NOT_RETRYABLE' : 'DOCUMENT_NOT_GENERATABLE';
    const document = await this.requireDocument(documentId);
    const template = await this.templates.findById(document.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    this.assertVariablesPresent(template.variables, document.variables);

    if (
      document.status === 'completed' ||
      document.status === 'queued' ||
      document.status === 'processing'
    ) {
      if (intent === 'retry') {
        throw new AppError(409, notAllowedCode, 'Only failed documents can be retried', {
          status: document.status,
        });
      }
      return this.snapshot(document.id, document.status);
    }

    if (!allowedFrom.includes(document.status)) {
      throw new AppError(409, notAllowedCode, 'Document cannot be enqueued from current status', {
        status: document.status,
      });
    }

    const queued = await markDocumentQueued(this.db, document.id, allowedFrom);
    if (!queued) {
      const latest = await this.requireDocument(documentId);
      if (intent === 'retry') {
        throw new AppError(409, notAllowedCode, 'Document is no longer failed');
      }
      return this.snapshot(
        latest.id,
        latest.status === 'completed' ||
          latest.status === 'processing' ||
          latest.status === 'queued'
          ? latest.status
          : 'queued',
      );
    }

    await this.removeFinishedCertificateJob(document.id);
    const jobId = await enqueueCertificateGeneration(this.certificateQueue, document.id);
    return {
      documentId: queued.id,
      status: 'queued',
      jobId,
    };
  }

  private snapshot(
    documentId: string,
    status: 'queued' | 'processing' | 'completed',
  ): GenerateAccepted {
    return {
      documentId,
      status,
      jobId: certificateJobId(documentId),
    };
  }

  private async removeFinishedCertificateJob(documentId: string): Promise<void> {
    const existing = await this.certificateQueue.getJob(certificateJobId(documentId));
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

  private assertVariablesPresent(required: string[], variables: Record<string, unknown>): void {
    const missing = findMissingVariables(required, variables);
    if (missing.length > 0) {
      throw new AppError(422, 'MISSING_VARIABLES', 'Document is missing required variables', {
        missing,
      });
    }
  }
}
