import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '../..');
const matchingEngineRoot = resolve(root, '../../matchingengine');
const fixserverRoot = resolve(root, '../../fixserver');

export default defineConfig({
  resolve: {
    alias: {
      '@ancontrade/shared': resolve(root, 'packages/shared/src/index.ts'),
      '@matchingengine/engine': resolve(matchingEngineRoot, 'packages/engine/src/index.ts'),
      '@matchingengine/gateway': resolve(matchingEngineRoot, 'packages/gateway/src/index.ts'),
      '@matchingengine/shared-types': resolve(matchingEngineRoot, 'packages/shared-types/src/index.ts'),
      '@fixenginelib/core': resolve(fixserverRoot, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: false,
  },
});
