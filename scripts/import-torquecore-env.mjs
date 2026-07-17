import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] ?? '../torquecore.de/.env.local');
const targetPath = resolve(process.argv[3] ?? '.env.local');

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function serializeValue(value) {
  return /[\s#"'\\]/.test(value) ? JSON.stringify(value) : value;
}

const source = parseEnv(await readFile(sourcePath, 'utf8'));
const targetText = await readFile(targetPath, 'utf8').catch(() => '');
const target = parseEnv(targetText);
const mappings = new Map([
  ['TORQUECORE_SUPABASE_URL', source.get('SUPABASE_URL') ?? source.get('NEXT_PUBLIC_SUPABASE_URL')],
  ['TORQUECORE_SUPABASE_SERVICE_ROLE_KEY', source.get('SUPABASE_SERVICE_ROLE_KEY')],
  ['TORQUECORE_OPENAI_API_KEY', source.get('OPENAI_API_KEY')],
  ['TORQUECORE_OPENAI_MODEL', source.get('OPENAI_TRACKING_MODEL') ?? 'gpt-5.4-mini'],
  ['TORQUECORE_OPENAI_LANGUAGE', source.get('OPENAI_TRACKING_LANGUAGE') ?? 'ru'],
  ['TORQUECORE_TELEGRAM_BOT_TOKEN', source.get('TELEGRAM_BOT_TOKEN')],
  ['TORQUECORE_TELEGRAM_CHAT_ID', source.get('TELEGRAM_CHAT_ID')],
  ['TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID', '361'],
  ['PLAYWRIGHT_HEADLESS', 'false'],
]);

for (const [key, value] of mappings) {
  if (value) target.set(key, value);
}

const managedKeys = new Set(mappings.keys());
const preserved = targetText
  .split(/\r?\n/)
  .filter((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    return !match || !managedKeys.has(match[1]);
  })
  .join('\n')
  .trimEnd();
const managed = [...mappings.keys()]
  .filter((key) => target.has(key))
  .map((key) => `${key}=${serializeValue(target.get(key))}`)
  .join('\n');
const next = [preserved, '# TorqueCore integration (managed import)', managed]
  .filter(Boolean)
  .join('\n\n');

await writeFile(targetPath, `${next}\n`, 'utf8');
console.info(
  `Imported ${[...mappings.keys()].filter((key) => target.has(key)).length} TorqueCore settings into ${targetPath}.`,
);
