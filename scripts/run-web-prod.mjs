// Runs the web app in *production* mode (build or start) with local env.
// Mirrors run-with-local-env.mjs but forces NODE_ENV=production, because
// .env.local sets NODE_ENV=development which corrupts `next build`
// (static prerender of /404 and /_error fails with a bogus
// "<Html> should not be imported outside of pages/_document" error).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
if (mode !== 'build' && mode !== 'start') {
  console.error('Usage: node scripts/run-web-prod.mjs <build|start>');
  process.exit(1);
}

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const root = process.cwd();
const localEnv = parseEnvFile(path.join(root, '.env.local'));
const env = { ...process.env, ...localEnv, NODE_ENV: 'production' };
const localBin = path.join(root, 'node_modules', '.bin');
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = `${localBin}${path.delimiter}${env[pathKey] ?? ''}`;

const nextBin = path.join(root, 'apps', 'web', 'node_modules', '.bin', 'next.CMD');
const nextArgs = mode === 'start' ? ['start', '--port', '3000'] : ['build'];

const result = spawnSync(existsSync(nextBin) ? nextBin : 'next', nextArgs, {
  cwd: path.join(root, 'apps', 'web'),
  stdio: 'inherit',
  shell: true,
  env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
