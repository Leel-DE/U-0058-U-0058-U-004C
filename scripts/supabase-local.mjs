import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/supabase-local.mjs <supabase args...>');
  process.exit(1);
}

const root = process.cwd();

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

// No shell here: `--format` templates contain characters cmd.exe treats as
// argument separators, which silently mangles the query.
function docker(dockerArgs) {
  const result = spawnSync('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dockerDesktopRunning() {
  const result = spawnSync('tasklist', ['/fi', 'imagename eq Docker Desktop.exe', '/nh'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return (result.stdout?.toString() ?? '').includes('Docker Desktop.exe');
}

// The desktop app starts hidden at login, and Docker Desktop is not
// necessarily configured to do the same - launch it ourselves rather than fail
// the whole stack because the engine is not up yet.
function startDockerDesktop() {
  if (process.platform !== 'win32' || dockerDesktopRunning()) return false;
  const exe = path.join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Docker',
    'Docker',
    'Docker Desktop.exe',
  );
  if (!existsSync(exe)) return false;
  console.log('Docker Desktop is not running; starting it...');
  const child = spawnSync('cmd', ['/c', 'start', '""', '/b', exe, '-Autostart'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return !child.error;
}

// Docker Desktop needs a while after a Windows boot before the daemon answers.
// Without this wait the desktop app would spawn `supabase start` into a dead
// daemon and treat the failure as a broken stack.
function waitForDocker(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  let reported = false;
  let launched = false;
  while (Date.now() < deadline) {
    if (docker(['info', '--format', '{{.ServerVersion}}']).ok) return true;
    if (!launched) {
      launched = true;
      startDockerDesktop();
    }
    if (!reported) {
      console.log('Waiting for the Docker daemon to become available...');
      reported = true;
    }
    sleep(3_000);
  }
  return false;
}

function projectId() {
  const configPath = path.join(root, 'supabase', 'config.toml');
  if (!existsSync(configPath)) return null;
  const match = readFileSync(configPath, 'utf8').match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

function localPorts() {
  const configPath = path.join(root, 'supabase', 'config.toml');
  if (!existsSync(configPath)) return [54321, 54322];
  const ports = new Set();
  for (const match of readFileSync(configPath, 'utf8').matchAll(/^\s*port\s*=\s*(\d+)/gm)) {
    const port = Number(match[1]);
    if (port >= 54320 && port <= 54340) ports.add(port);
  }
  return ports.size > 0 ? [...ports] : [54321, 54322];
}

// Windows hands ports 49152-65535 to the ephemeral pool, and WinNAT/Hyper-V
// reserves random 100-port blocks out of it on every boot. When such a block
// covers the Supabase ports, Docker cannot publish them: the containers die
// with "bind: An attempt was made to access a socket in a way forbidden by its
// access permissions" and `supabase start` then refuses to run forever. A real
// bind attempt is the only reliable probe - an administered exclusion (the
// permanent fix) also shows up in netsh but still allows explicit binds.
function probePort(port) {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const net=require('node:net');const s=net.createServer();` +
        `s.once('error',(e)=>{process.stdout.write(e.code||'ERROR');process.exit(0)});` +
        `s.listen(${port},'0.0.0.0',()=>{s.close(()=>{process.stdout.write('FREE')})});`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 },
  );
  const code = result.stdout?.toString().trim();
  if (code === 'FREE') return 'free';
  if (code === 'EADDRINUSE') return 'in-use';
  if (code === 'EACCES') return 'blocked';
  return 'free';
}

function blockedPorts() {
  if (process.platform !== 'win32') return [];
  return localPorts().filter((port) => probePort(port) === 'blocked');
}

function reportBlockedPorts(ports) {
  console.error('');
  console.error(`Windows has reserved the local Supabase ports: ${ports.join(', ')}.`);
  console.error('Docker cannot publish them, so the Supabase containers cannot start.');
  console.error('Fix it once (the reservation survives reboots) in an elevated PowerShell:');
  console.error('');
  console.error('    pwsh -File scripts/fix-windows-supabase-ports.ps1');
  console.error('');
  console.error('See LOCAL_DEV.md > "Ports reserved by Windows" for details.');
}

function stackContainers(id) {
  const result = docker([
    'ps',
    '-a',
    '--filter',
    `name=_${id}`,
    '--format',
    '{{.Names}}\t{{.State}}',
  ]);
  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, state] = line.split('\t');
      return { name, state };
    });
}

// The published port is bound the moment the container starts, so it says
// nothing about Postgres being ready. Only the container health check does.
function waitForHealthy(name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = docker(['inspect', '-f', '{{.State.Health.Status}}', name]);
    if (!result.ok) return false;
    const state = result.stdout.trim();
    if (state === 'healthy') return true;
    if (state === '' || state === '<no value>') return true;
    if (state === 'unhealthy') return false;
    sleep(2_000);
  }
  return false;
}

// `supabase start` only ever creates containers. When the machine reboots (or
// Docker restarts) it finds the existing but exited containers, prints
// "supabase start is already running" plus "<db container> is not running:
// exited", and exits 1 - forever. Restarting the containers ourselves turns
// that dead end into a normal boot.
function restartStoppedStack() {
  const id = projectId();
  if (!id) return;
  const containers = stackContainers(id);
  if (containers.length === 0) return;
  const stopped = containers.filter((container) => container.state !== 'running');
  if (stopped.length === 0) return;

  console.log(`Restarting ${stopped.length} stopped Supabase container(s)...`);
  const dbName = `supabase_db_${id}`;
  const db = stopped.find((container) => container.name === dbName);
  if (db) {
    const started = docker(['start', dbName]);
    if (!started.ok) {
      console.error(started.stderr.trim());
      return;
    }
    // Services like rest/realtime exit immediately when Postgres is not
    // accepting connections yet, and `supabase start` rejects a database that
    // is merely "starting", so wait for the health check to pass.
    waitForHealthy(dbName, 120_000);
  }

  for (const container of stopped) {
    if (container.name === dbName) continue;
    const started = docker(['start', container.name]);
    if (!started.ok) console.error(started.stderr.trim());
  }
}

// Last resort when the containers cannot be revived (stale image, changed
// config, half-created stack). `supabase stop` keeps the data volumes, so this
// only recreates the containers - local data survives. Any container the CLI
// failed to remove is dropped by hand, otherwise the next `start` dies with
// "container name is already in use".
function recreateStack() {
  console.log('Recreating the Supabase stack (data volumes are kept)...');
  runSupabase(['stop']);
  const id = projectId();
  if (!id) return;
  for (const container of stackContainers(id)) {
    docker(['rm', '-f', container.name]);
  }
}

// The desktop app retries `supabase start` on a timer, so a start launched
// from a terminal can collide with it. Two concurrent runs fight over the same
// container names and leave the stack half-created ("container name is already
// in use"), so only one start is allowed at a time.
function lockPath() {
  return path.join(tmpdir(), `supabase-start-${projectId() ?? 'local'}.lock`);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function acquireStartLock(timeoutMs = 600_000) {
  const file = lockPath();
  const deadline = Date.now() + timeoutMs;
  let reported = false;
  while (Date.now() < deadline) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return file;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(file, 'utf8').trim());
      if (!Number.isInteger(owner) || owner <= 0 || !processAlive(owner)) {
        rmSync(file, { force: true });
        continue;
      }
      if (!reported) {
        console.log('Another `supabase start` is already running; waiting for it to finish...');
        reported = true;
      }
      sleep(2_000);
    }
  }
  return null;
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
let command = 'supabase';
let prefix = [];

if (process.platform === 'win32' && commandExists('supabase.exe')) {
  command = 'supabase.exe';
} else if (!commandExists('supabase')) {
  command = pnpm;
  prefix = ['dlx', 'supabase@latest'];
}

function runSupabase(supabaseArgs) {
  const result = spawnSync(command, [...prefix, ...supabaseArgs], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 0;
}

let lockFile = null;

function releaseStartLock() {
  if (!lockFile) return;
  rmSync(lockFile, { force: true });
  lockFile = null;
}

process.on('exit', releaseStartLock);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    releaseStartLock();
    process.exit(1);
  });
}

let status = 0;

if (args[0] === 'start') {
  if (!waitForDocker()) {
    console.error('The Docker daemon is not responding. Start Docker Desktop and try again.');
    process.exit(1);
  }
  const blocked = blockedPorts();
  if (blocked.length > 0) {
    reportBlockedPorts(blocked);
    process.exit(1);
  }
  lockFile = acquireStartLock();
  if (!lockFile) {
    // The other run held the lock for longer than we waited. If it brought the
    // API up, there is nothing left to do; otherwise report the failure.
    const apiUp = probePort(54321) === 'in-use';
    console.error(
      apiUp
        ? 'Supabase is already running (started by a concurrent run).'
        : 'Timed out waiting for a concurrent `supabase start` to finish.',
    );
    process.exit(apiUp ? 0 : 1);
  }
  restartStoppedStack();
  status = runSupabase(args);
  // A stack left half-created still fails the first start. Recreate the
  // containers once and retry before giving up.
  if (status !== 0) {
    recreateStack();
    status = runSupabase(args);
  }
  releaseStartLock();
} else {
  status = runSupabase(args);
}

process.exit(status);
