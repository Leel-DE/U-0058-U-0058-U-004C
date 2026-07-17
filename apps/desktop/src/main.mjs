import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, Menu, nativeImage, Notification, shell, Tray } from 'electron';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopRoot, '../..');
const hiddenStart = process.argv.includes('--hidden');
const services = [
  { name: 'web', port: 3000, script: 'dev:web' },
  { name: 'worker', port: 4000, script: 'dev:worker' },
  { name: 'inngest', port: 8288, script: 'dev:inngest' },
];
const children = new Map();
let mainWindow = null;
let tray = null;
let shuttingDown = false;
let serviceTimer = null;
let eventTimer = null;
let eventCursor = null;
let firstEventRead = true;

function loadEnvironment() {
  const envPath = join(repoRoot, '.env.local');
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile?.(envPath);
  } catch (error) {
    console.error('Could not load .env.local', error);
  }
}

function logDirectory() {
  const base = process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || app.getPath('logs');
  const directory = join(base, 'CompetitionRadar', 'logs');
  mkdirSync(directory, { recursive: true });
  return directory;
}

function logStream(name) {
  return createWriteStream(join(logDirectory(), `${name}.log`), {
    flags: 'a',
  });
}

function isPortOpen(port, timeoutMs = 800) {
  return new Promise((resolveResult) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.destroy();
      resolveResult(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return false;
}

function pnpmCommand(args) {
  const pnpmEntry = join(
    process.env.APPDATA ?? '',
    'npm',
    'node_modules',
    'pnpm',
    'bin',
    'pnpm.cjs',
  );
  if (process.platform === 'win32' && existsSync(pnpmEntry)) {
    const systemNode = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe');
    return {
      command: existsSync(systemNode) ? systemNode : 'node',
      args: [pnpmEntry, ...args],
    };
  }
  return { command: 'pnpm', args };
}

function startService(service) {
  if (children.has(service.name) || shuttingDown) return;
  const stream = logStream(service.name);
  stream.write(`\n[${new Date().toISOString()}] Starting ${service.name}\n`);
  const pnpm = pnpmCommand([service.script]);
  const child = spawn(pnpm.command, pnpm.args, {
    cwd: repoRoot,
    env: process.env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(service.name, { child, stream });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  child.once('exit', (code, signal) => {
    stream.write(
      `[${new Date().toISOString()}] Exited code=${code ?? 'none'} signal=${signal ?? 'none'}\n`,
    );
    stream.end();
    children.delete(service.name);
    if (!shuttingDown) {
      setTimeout(() => void ensureServices(), 3_000).unref();
    }
  });
}

async function runSupabaseStart() {
  if (await isPortOpen(54321)) return;
  const stream = logStream('supabase');
  stream.write(`\n[${new Date().toISOString()}] Starting local Supabase\n`);
  await new Promise((resolveRun) => {
    const pnpm = pnpmCommand(['supabase:start']);
    const child = spawn(pnpm.command, pnpm.args, {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    const timeout = setTimeout(() => {
      stream.write('Supabase start timed out.\n');
      resolveRun();
    }, 120_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveRun();
    });
  });
  stream.end();
}

async function ensureServices() {
  if (shuttingDown) return;
  await runSupabaseStart();
  for (const service of services) {
    const open = await isPortOpen(service.port);
    if (!open) startService(service);
  }
}

function stopOwnedProcesses() {
  for (const { child, stream } of children.values()) {
    if (child.pid && process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
    stream.end();
  }
  children.clear();
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu(state = 'Starting') {
  if (!tray) return;
  tray.setToolTip(`Competition Radar — ${state}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Automation: ${state}`, enabled: false },
      { type: 'separator' },
      { label: 'Open Competition Radar', click: showMainWindow },
      {
        label: 'Open Logs',
        click: () => void shell.openPath(logDirectory()),
      },
      {
        label: 'Restart Services',
        click: () => {
          stopOwnedProcesses();
          setTimeout(() => void ensureServices(), 500).unref();
        },
      },
      { type: 'separator' },
      {
        label: 'Exit Competition Radar',
        click: () => {
          shuttingDown = true;
          app.quit();
        },
      },
    ]),
  );
}

async function pollAutomation() {
  try {
    const healthResponse = await fetch('http://127.0.0.1:4000/health', {
      signal: AbortSignal.timeout(2_000),
    });
    const health = await healthResponse.json();
    const state = health?.automation?.state ?? 'unknown';
    updateTrayMenu(state);

    const secret = process.env.WORKER_SHARED_SECRET;
    if (!secret) return;
    const query = eventCursor
      ? `?after=${encodeURIComponent(eventCursor)}&limit=100`
      : '?limit=100';
    const response = await fetch(`http://127.0.0.1:4000/automation/events${query}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const events = Array.isArray(payload.events) ? payload.events : [];
    if (events.length > 0) eventCursor = events.at(-1).id;
    if (firstEventRead) {
      firstEventRead = false;
      return;
    }
    for (const event of events) {
      if (!['run_completed', 'run_failed'].includes(event.event)) continue;
      if (Notification.isSupported()) {
        new Notification({
          title:
            event.event === 'run_completed' ? 'Shipment Check Completed' : 'Shipment Check Failed',
          body: event.message,
        }).show();
      }
    }
  } catch {
    updateTrayMenu('offline');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b',
    icon: join(desktopRoot, 'assets', 'tray-icon.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on('close', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function boot() {
  loadEnvironment();
  createWindow();
  const trayImage = nativeImage.createFromPath(join(desktopRoot, 'assets', 'tray-icon.svg'));
  tray = new Tray(trayImage);
  tray.on('double-click', showMainWindow);
  updateTrayMenu();

  await ensureServices();
  const webReady = await waitForPort(3000, 120_000);
  if (webReady) {
    await mainWindow.loadURL('http://127.0.0.1:3000/automation');
  } else {
    await mainWindow.loadURL(
      "data:text/html;charset=utf-8,<main style='font:16px system-ui;padding:32px'><h1>Competition Radar could not start</h1><p>Open the tray menu and check the logs.</p></main>",
    );
  }
  if (!hiddenStart) showMainWindow();

  serviceTimer = setInterval(() => void ensureServices(), 10_000);
  serviceTimer.unref();
  await pollAutomation();
  eventTimer = setInterval(() => void pollAutomation(), 3_000);
  eventTimer.unref();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(boot);
}

app.on('before-quit', () => {
  shuttingDown = true;
  if (serviceTimer) clearInterval(serviceTimer);
  if (eventTimer) clearInterval(eventTimer);
  stopOwnedProcesses();
});

app.on('window-all-closed', () => {
  // The tray process owns the automation runtime and stays online.
});
