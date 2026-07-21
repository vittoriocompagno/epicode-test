import { CreateBatchSchema } from '@certificates/contracts';
import type { CreateBatchInput } from '@certificates/contracts';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseJsonObject(json: string): ParseResult<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Must be a JSON object.' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'JSON is invalid.' };
  }
}

export function parseVariables(json: string): ParseResult<Record<string, unknown>> {
  const result = parseJsonObject(json);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === 'Must be a JSON object.'
        ? 'Variables must be a JSON object.'
        : 'Variables JSON is invalid.',
    };
  }
  return result;
}

export function parseBatchInput(
  templateId: string,
  itemsJson: string,
  emailTo?: string,
): ParseResult<CreateBatchInput> {
  if (!templateId) {
    return { ok: false, error: 'Select a template.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(itemsJson);
  } catch {
    return { ok: false, error: 'Items JSON is invalid.' };
  }

  const payload = {
    templateId,
    items: parsed,
    ...(emailTo?.trim() ? { emailTo: emailTo.trim() } : {}),
  };

  const result = CreateBatchSchema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Invalid batch input.' };
  }

  return { ok: true, data: result.data };
}
