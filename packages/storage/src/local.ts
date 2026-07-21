import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentStorage, PutDocumentInput, StoredDocument } from './types.js';

export type LocalFilesystemStorageOptions = {
  rootDir: string;
};

/**
 * Minimal local filesystem adapter skeleton.
 * Object-storage adapters (S3/MinIO) are intentionally deferred.
 */
export class LocalFilesystemStorage implements DocumentStorage {
  private readonly rootDir: string;

  constructor(options: LocalFilesystemStorageOptions) {
    this.rootDir = path.resolve(options.rootDir);
  }

  async put(input: PutDocumentInput): Promise<StoredDocument> {
    const absolutePath = this.resolveKey(input.key);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.body);

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
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.rootDir, normalized);

    if (!absolutePath.startsWith(this.rootDir)) {
      throw new Error('Invalid storage key: path escapes storage root');
    }

    return absolutePath;
  }
}
