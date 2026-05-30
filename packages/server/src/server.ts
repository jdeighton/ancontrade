import Fastify from 'fastify';

export function buildServer() {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
