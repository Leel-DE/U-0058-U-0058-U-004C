import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/supabase-local.mjs <supabase args...>');
  process.exit(1);
}

function commandExists(command, testArgs = ['--version']) {
  const result = spawnSync(command, testArgs, {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return !result.error && result.status === 0;
}

if (process.platform === 'win32') {
  const dockerBin = 'C:\\Program Files\\Docker\\Docker\\resources\\bin';
  if (!process.env.PATH?.includes(dockerBin)) {
    process.env.PATH = `${dockerBin};${process.env.PATH ?? ''}`;
  }
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
let command = 'supabase';
let finalArgs = args;

if (process.platform === 'win32' && commandExists('supabase.exe')) {
  command = 'supabase.exe';
} else if (!commandExists('supabase')) {
  command = pnpm;
  finalArgs = ['dlx', 'supabase@latest', ...args];
}

const result = spawnSync(command, finalArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
