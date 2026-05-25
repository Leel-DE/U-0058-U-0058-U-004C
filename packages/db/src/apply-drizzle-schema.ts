import { spawn } from 'node:child_process';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function main() {
  console.log('Applying Drizzle-managed schema: tables, columns, indexes, enums');
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await run(pnpm, ['exec', 'drizzle-kit', 'push', '--force']);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
