import { loadEnv } from './env.js';
import { buildApp } from './app.js';

const env = loadEnv();
const app = await buildApp(env);

try {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`API listening on http://localhost:${env.API_PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
