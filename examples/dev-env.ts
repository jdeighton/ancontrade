/**
 * Development environment orchestrator.
 *
 * Starts the matching engine and ancontrade server in parallel, then
 * auto-configures the "Test Exchange" venue via the admin API so you can
 * immediately click "Connect" in the browser.
 *
 * Prerequisites (run once, or after pulling changes):
 *   cd D:/NextCloud/src/matchingengine && npm install && npm run build
 *   cd D:/NextCloud/src/ancontrade     && npm install
 *
 * Usage (from the ancontrade repo root):
 *   npm run example1
 *
 * FIX session layout:
 *   ANCONTRADE-EXCHANGE_MD-FIX.4.4  ↔  EXCHANGE_MD-ANCONTRADE-FIX.4.4  (port 9001, market data)
 *   ANCONTRADE-EXCHANGE_OR-FIX.4.4  ↔  EXCHANGE_OR-ANCONTRADE-FIX.4.4  (port 9002, order routing)
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dir              = dirname(fileURLToPath(import.meta.url));
const ancontradeRoot     = resolve(__dir, '..');
const matchingEngineRoot = resolve(__dir, '../../matchingengine');
const engineScript       = resolve(matchingEngineRoot, 'examples/ancontrade/engine.ts');
const liveServerScript   = resolve(__dir, 'live-server.ts');

// Use the tsx CLI from the ancontrade local install to avoid pulling an
// incompatible cached version via `npx tsx` when tsx is not installed in
// the matchingengine repo.
const tsxCli = resolve(ancontradeRoot, 'node_modules/tsx/dist/cli.mjs');

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const R = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
const CYAN = '\x1b[36m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m';

function pfx(color: string, label: string): string {
  return `${color}${BOLD}[${label}]${R}  `;
}

// ─── Build step ───────────────────────────────────────────────────────────────
// @ancontrade/shared is a workspace package whose exports point to dist/.
// Build it synchronously before starting the server so the import resolves.

console.log(`${pfx(CYAN, 'DEV')}Building @ancontrade/shared…`);
const buildResult = spawnSync(
  'npm',
  ['run', 'build', '-w', '@ancontrade/shared'],
  { cwd: ancontradeRoot, stdio: 'inherit', shell: true },
);
if (buildResult.status !== 0) {
  console.error(`${pfx(CYAN, 'DEV')}Build failed — aborting.`);
  process.exit(1);
}

// ─── Child process helpers ────────────────────────────────────────────────────

function spawnPrefixed(
  label: string,
  color: string,
  script: string,
  cwd: string,
): ChildProcess {
  const child = spawn('node', [tsxCli, script], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const p = pfx(color, label);

  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) process.stdout.write(`${p}${line}\n`);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) process.stderr.write(`${p}${line}\n`);
    }
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${p}exited with code ${code}`);
    }
  });

  return child;
}

function spawnClient(): ChildProcess {
  const clientRoot = resolve(ancontradeRoot, 'packages/client');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: clientRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  const p = pfx('\x1b[35m', 'CLIENT');
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) process.stdout.write(`${p}${line}\n`);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) process.stderr.write(`${p}${line}\n`);
    }
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`${p}exited with code ${code}`);
  });
  return child;
}

// ─── Readiness poll ───────────────────────────────────────────────────────────

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not ready yet — keep polling
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${url} did not become ready within ${timeoutMs / 1000}s`);
}

// ─── Venue auto-configuration ─────────────────────────────────────────────────

async function configureVenue(base: string): Promise<void> {
  async function post<T>(path: string, body: object): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  // Idempotent: skip if any venue already exists (e.g., server was not restarted).
  const existing = await fetch(`${base}/admin/venues`).then(r => r.json()) as any[];
  if (existing.length > 0) {
    console.log(`${pfx(GREEN, 'SETUP')}Venue already configured — skipping.`);
    return;
  }

  const [mdSC, orSC] = await Promise.all([
    post<{ id: string }>('/admin/session-configs', {
      name:         'Test Exchange MD',
      host:         '127.0.0.1',
      port:         9001,
      senderCompId: 'ANCONTRADE',
      targetCompId: 'EXCHANGE_MD',
    }),
    post<{ id: string }>('/admin/session-configs', {
      name:         'Test Exchange OR',
      host:         '127.0.0.1',
      port:         9002,
      senderCompId: 'ANCONTRADE',
      targetCompId: 'EXCHANGE_OR',
    }),
  ]);

  const [trader, account] = await Promise.all([
    post<{ id: string }>('/admin/trader-id-configs', {
      traderId:     'TRADER1',
      displayAlias: 'Dev Trader',
    }),
    post<{ id: string }>('/admin/account-configs', {
      account:      'PROP001',
      displayAlias: 'Prop Account',
    }),
  ]);

  await post('/admin/venues', {
    name:               'Test Exchange',
    mdSessionConfigId:  mdSC.id,
    orSessionConfigId:  orSC.id,
    traderIdConfigId:   trader.id,
    accountConfigIds:   [account.id],
  });

  console.log(`${pfx(GREEN, 'SETUP')}Venue "Test Exchange" configured.`);
  console.log(`${pfx(GREEN, 'SETUP')}Instruments: ESM6  NQM6  (both markets open)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SERVER_URL = 'http://localhost:3001';

console.log(`${pfx(CYAN, 'DEV')}Starting matching engine (MD :9001  OR :9002)…`);
const engineProc = spawnPrefixed('ENGINE', CYAN,   engineScript,     matchingEngineRoot);

console.log(`${pfx(CYAN, 'DEV')}Starting ancontrade server (:3001)…`);
const serverProc = spawnPrefixed('SERVER', YELLOW, liveServerScript, ancontradeRoot);

console.log(`${pfx(CYAN, 'DEV')}Starting Vite client (:5173)…`);
const clientProc = spawnClient();

// Short pause so the engine ports are listening before the server tries to connect.
// (The server only connects when you click "Connect" in the UI, but giving the engine
// a head-start avoids a misleading "connection refused" on the first click.)
await new Promise(r => setTimeout(r, 1500));

console.log(`${pfx(CYAN, 'DEV')}Waiting for server to be ready…`);
await waitForServer(`${SERVER_URL}/health`);

await configureVenue(SERVER_URL);

console.log();
console.log(`${pfx(GREEN, 'READY')}${BOLD}Open http://localhost:5173 in your browser.${R}`);
console.log(`${pfx(GREEN, 'READY')}Select "Test Exchange" and click ${BOLD}Connect${R}.`);
console.log(`${pfx(GREEN, 'READY')}Press ${BOLD}Ctrl-C${R} to stop all processes.`);
console.log();

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${pfx(CYAN, 'DEV')}Shutting down…`);
  engineProc.kill('SIGINT');
  serverProc.kill('SIGINT');
  clientProc.kill('SIGINT');
  // Give child processes 3 s to exit cleanly before forcing shutdown.
  setTimeout(() => {
    engineProc.kill('SIGKILL');
    serverProc.kill('SIGKILL');
    clientProc.kill('SIGKILL');
    process.exit(0);
  }, 3000).unref();
});
