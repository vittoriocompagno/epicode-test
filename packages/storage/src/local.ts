import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentStorage, PutDocumentInput, StoredDocument } from './types.js';

export type LocalFilesystemStorageOptions = {
  rootDir: string;
};

export class LocalFilesystemStorage implements DocumentStorage {
  private readonly rootDir: string;

  constructor(options: LocalFilesystemStorageOptions) {
    this.rootDir = path.resolve(options.rootDir);
  }

  async put(input: PutDocumentInput): Promise<StoredDocument> {
    const absolutePath = this.resolveKey(input.key);
    await mkdir(path.dirname(absolutePath), { recursive: true });

    const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, input.body);
    await rename(temporaryPath, absolutePath);

    return {
      key: input.key,
      contentType: input.contentType,
      size: input.body.byteLength,
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('\0')) {
      throw new Error('Invalid storage key');
    }

    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.rootDir, normalized);
    const rootWithSep = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : `${this.rootDir}${path.sep}`;

    if (absolutePath !== this.rootDir && !absolutePath.startsWith(rootWithSep)) {
      throw new Error('Invalid storage key: path escapes storage root');
    }

    return absolutePath;
  }
}

export function documentPdfStorageKey(documentId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    throw new Error('Invalid document id for storage key');
  }
  return `documents/${documentId}.pdf`;
}
