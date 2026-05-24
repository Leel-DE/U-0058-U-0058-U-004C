import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const supabaseStatusText = { value: '' };
const defaultDockerBin =
  process.platform === 'win32' ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin' : '';

if (defaultDockerBin && !process.env.PATH?.includes(defaultDockerBin)) {
  process.env.PATH = `${defaultDockerBin}${path.delimiter}${process.env.PATH ?? ''}`;
}

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...options.env },
  });

  if (options.capture) {
    const stdout = result.stdout?.toString() ?? '';
    const stderr = result.stderr?.toString() ?? '';
    if (result.error || result.status !== 0) {
      throw new Error(`${command} ${args.join(' ')} failed\n${stdout}${stderr}`);
    }
    return stdout.trim();
  }

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
  return '';
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return !result.error && result.status === 0;
}

function pnpmCommand() {
  if (process.platform === 'win32' && commandExists('pnpm.cmd')) return 'pnpm.cmd';
  if (commandExists('pnpm')) return 'pnpm';
  throw new Error('pnpm is not available. Install pnpm 9.12+ first.');
}

function supabaseCommand(pnpm) {
  if (process.platform === 'win32' && commandExists('supabase.exe')) {
    return { command: 'supabase.exe', prefix: [] };
  }
  if (commandExists('supabase')) {
    return { command: 'supabase', prefix: [] };
  }
  console.warn('Supabase CLI was not found globally; falling back to `pnpm dlx supabase@latest`.');
  console.warn('For offline work, install the CLI once and keep it on PATH: https://supabase.com/docs/guides/local-development/cli/getting-started');
  return { command: pnpm, prefix: ['dlx', 'supabase@latest'] };
}

function runSupabase(supa, args, options) {
  return run(supa.command, [...supa.prefix, ...args], options);
}

function parseEnvOutput(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function parseHumanStatus(text) {
  const find = (...labels) => {
    for (const label of labels) {
      const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*(.+)`, 'i');
      const match = text.match(re);
      if (match?.[1]) return match[1].trim();
    }
    return undefined;
  };

  return {
    SUPABASE_URL: find('API URL', 'SUPABASE_URL'),
    SUPABASE_ANON_KEY: find('anon key', 'ANON_KEY', 'SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: find('service_role key', 'service role key', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_DB_URL: find('DB URL', 'Database URL', 'SUPABASE_DB_URL'),
  };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signLocalJwt(role) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'supabase',
    ref: 'competitor-radar-local',
    role,
    iat: 1641769200,
    exp: 2524608000,
  };
  const body = `${base64url(header)}.${base64url(payload)}`;
  const sig = createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function localEnvFromStatus(text) {
  const envStatus = parseEnvOutput(text);
  const humanStatus = parseHumanStatus(text);

  return {
    NODE_ENV: 'development',
    LOCAL_DEV_MODE: 'true',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL:
      envStatus.SUPABASE_URL ?? envStatus.API_URL ?? humanStatus.SUPABASE_URL ?? LOCAL_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      envStatus.SUPABASE_ANON_KEY ?? envStatus.ANON_KEY ?? humanStatus.SUPABASE_ANON_KEY ?? signLocalJwt('anon'),
    SUPABASE_SERVICE_ROLE_KEY:
      envStatus.SUPABASE_SERVICE_ROLE_KEY ??
      envStatus.SERVICE_ROLE_KEY ??
      humanStatus.SUPABASE_SERVICE_ROLE_KEY ??
      signLocalJwt('service_role'),
    DATABASE_URL:
      envStatus.SUPABASE_DB_URL ?? envStatus.DB_URL ?? humanStatus.SUPABASE_DB_URL ?? LOCAL_DB_URL,
    DIRECT_URL:
      envStatus.SUPABASE_DB_URL ?? envStatus.DB_URL ?? humanStatus.SUPABASE_DB_URL ?? LOCAL_DB_URL,
    INNGEST_EVENT_KEY: 'local_dev_event_key',
    INNGEST_SIGNING_KEY: 'signkey-local-dev',
    WORKER_URL: 'http://localhost:4000',
    WORKER_HOST: '127.0.0.1',
    WORKER_SHARED_SECRET: 'local-worker-secret-change-me',
    WORKER_BROWSER_MAX_PAGES: '2',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: 'Competitor Radar Local <admin@demo.local>',
    SENTRY_DSN: '',
    NEXT_PUBLIC_SENTRY_DSN: '',
    NEXT_PUBLIC_POSTHOG_KEY: '',
    NEXT_PUBLIC_POSTHOG_HOST: '',
    SEED_ADMIN_EMAIL: 'admin@demo.local',
    SEED_ADMIN_PASSWORD: 'DemoAdmin!2026',
  };
}

function readEnvFile(file) {
  if (!existsSync(file)) return { order: [], values: {} };
  const order = [];
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    order.push(match[1]);
    values[match[1]] = match[2];
  }
  return { order, values };
}

function writeEnvFile(file, localValues) {
  const current = readEnvFile(file);
  const merged = { ...current.values, ...localValues };
  const preferredOrder = [
    'NODE_ENV',
    'LOCAL_DEV_MODE',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DIRECT_URL',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'WORKER_URL',
    'WORKER_HOST',
    'WORKER_SHARED_SECRET',
    'WORKER_BROWSER_MAX_PAGES',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'SENTRY_DSN',
    'NEXT_PUBLIC_SENTRY_DSN',
    'NEXT_PUBLIC_POSTHOG_KEY',
    'NEXT_PUBLIC_POSTHOG_HOST',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
  ];
  const remaining = current.order.filter((key) => !preferredOrder.includes(key));
  const lines = [
    '# Generated by pnpm setup:local. Local-only development defaults.',
    ...preferredOrder.map((key) => `${key}=${merged[key] ?? ''}`),
    ...remaining.map((key) => `${key}=${merged[key] ?? ''}`),
    '',
  ];
  writeFileSync(file, lines.join('\n'));
}

function printLocalUrls(localEnv) {
  console.log('\nLocal services');
  console.log(`  Web app         http://localhost:3000`);
  console.log(`  Worker          ${localEnv.WORKER_URL}`);
  console.log(`  Supabase API    ${localEnv.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`  Supabase DB     ${localEnv.DATABASE_URL}`);
  console.log(`  Supabase Studio http://localhost:54323`);
  console.log(`  Inbucket        http://localhost:54324`);
  console.log(`  Inngest UI      http://localhost:8288`);
  console.log('\nDemo login');
  console.log(`  email           ${localEnv.SEED_ADMIN_EMAIL}`);
  console.log(`  password        ${localEnv.SEED_ADMIN_PASSWORD}`);
}

async function main() {
  const pnpm = pnpmCommand();

  console.log('Checking Docker...');
  if (!commandExists('docker', ['--version'])) {
    throw new Error('Docker CLI is not available. Install Docker Desktop and enable WSL2/Hyper-V backend.');
  }
  run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });

  const supa = supabaseCommand(pnpm);

  console.log('Starting local Supabase stack...');
  runSupabase(supa, ['start']);

  try {
    supabaseStatusText.value = runSupabase(supa, ['status', '-o', 'env'], { capture: true });
  } catch {
    supabaseStatusText.value = runSupabase(supa, ['status'], { capture: true });
  }

  const localEnv = localEnvFromStatus(supabaseStatusText.value);
  writeEnvFile(envPath, localEnv);
  console.log('.env.local is ready for local Supabase.');

  if (process.env.SKIP_PLAYWRIGHT_INSTALL !== '1') {
    console.log('Ensuring Chromium for Playwright worker...');
    run(pnpm, ['--filter', '@cr/worker', 'exec', 'playwright', 'install', 'chromium']);
  }

  console.log('Applying schema to local database...');
  run(pnpm, ['db:push']);

  console.log('Seeding local database and auth user...');
  run(pnpm, ['db:seed']);

  console.log('Checking DB connection...');
  run(pnpm, ['exec', 'tsx', 'scripts/check-local-db.mts'], { env: localEnv });

  printLocalUrls(localEnv);
  console.log('\nNext command: pnpm dev');
}

main().catch((err) => {
  console.error('\nLocal setup failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
