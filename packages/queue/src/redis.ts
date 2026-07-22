import { Redis, type RedisOptions } from 'ioredis';

export function createRedisConnection(url: string, role: 'client' | 'worker' = 'client'): Redis {
  return new Redis({
    ...parseRedisUrl(url),
    maxRetriesPerRequest: role === 'worker' ? null : 20,
    enableReadyCheck: true,
  });
}

export function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${parsed.protocol}`);
  }

  const database = parsed.pathname.slice(1);
  if (database && !/^\d+$/.test(database)) {
    throw new Error(`Invalid Redis database: ${database}`);
  }

  const options: RedisOptions = {
    host: parsed.hostname.replace(/^\[|\]$/g, ''),
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(database ? { db: Number(database) } : {}),
  };

  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}
