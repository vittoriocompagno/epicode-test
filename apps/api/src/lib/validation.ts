import { UuidSchema } from '@certificates/contracts';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../errors.js';

export function parseWithSchema<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export function parseUuidParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string>)[name];
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_ID', `Invalid ${name}`);
  }
  return parsed.data;
}
