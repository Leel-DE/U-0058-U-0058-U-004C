import { spawnSync } from 'node:child_process';

const url = process.argv[2] ?? 'http://localhost:54323';

const command =
  process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

const result = spawnSync(command[0], command[1], { stdio: 'ignore', shell: false });
if (result.error || result.status !== 0) {
  console.log(url);
}
