import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '../..');
const matchingEngineRoot = resolve(root, '../../matchingengine');
const fixserverRoot = resolve(root, '../../fixserver');

export default defineConfig({
  plugins: [
    {
      // node:sqlite appears in builtinModules only with the 'node:' prefix, not as bare
      // 'sqlite'. Vite 5 strips 'node:' before checking the list, so it fails to
      // recognise it as a built-in. Mark it external here before Vite's resolver runs.
      name: 'externalize-node-sqlite',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'node:sqlite') return { id, external: true };
      },
    },
  ],
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
