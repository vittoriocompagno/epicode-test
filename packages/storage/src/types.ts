export type StoredDocument = {
  key: string;
  contentType: string;
  size: number;
};

export type PutDocumentInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface DocumentStorage {
  put(input: PutDocumentInput): Promise<StoredDocument>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
