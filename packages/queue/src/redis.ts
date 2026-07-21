import { Redis } from 'ioredis';

/**
 * BullMQ requires maxRetriesPerRequest: null on shared connections used by workers.
 */
export function createRedisConnection(url: string, forWorker = false): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: forWorker ? null : 20,
    enableReadyCheck: true,
  });
}

export function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
  };
}
