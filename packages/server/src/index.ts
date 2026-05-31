import { buildServer } from './server.js';
import { NoopFIXEngine } from './venue/NoopFIXEngine.js';

const app = await buildServer(':memory:', new NoopFIXEngine());

try {
  await app.listen({ port: 3001, host: '0.0.0.0' });
  console.log('Server listening on port 3001');
} catch (err) {
  console.error(err);
  process.exit(1);
}
