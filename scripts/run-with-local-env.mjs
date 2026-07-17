import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-with-local-env.mjs <command> [args...]');
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
const env = { ...process.env, ...localEnv };
const [command, ...commandArgs] = args;
const localBin = path.join(root, 'node_modules', '.bin');
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = `${localBin}${path.delimiter}${env[pathKey] ?? ''}`;

function resolveCommand(name, commandArgs) {
  if (process.platform !== 'win32') {
    return { command: name, args: commandArgs, shell: false };
  }
  if (name === 'pnpm') {
    const pnpmEntry = path.join(
      process.env.APPDATA ?? '',
      'npm',
      'node_modules',
      'pnpm',
      'bin',
      'pnpm.cjs',
    );
    if (existsSync(pnpmEntry)) {
      return {
        command: process.execPath,
        args: [pnpmEntry, ...commandArgs],
        shell: false,
      };
    }
  }
  const localCmd = path.join(localBin, `${name}.CMD`);
  return {
    command: existsSync(localCmd) ? localCmd : name,
    args: commandArgs,
    shell: true,
  };
}

const resolved = resolveCommand(command, commandArgs);

const result = spawnSync(resolved.command, resolved.args, {
  cwd: root,
  stdio: 'inherit',
  shell: resolved.shell,
  env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
