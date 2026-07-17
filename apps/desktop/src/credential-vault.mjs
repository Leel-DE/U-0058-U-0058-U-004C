import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';

export class CredentialVault {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(this.filePath)) return {};
    try {
      const encrypted = Buffer.from(readFileSync(this.filePath, 'utf8'), 'base64');
      return JSON.parse(safeStorage.decryptString(encrypted));
    } catch {
      return {};
    }
  }

  save(values) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('os_encryption_unavailable');
    const allowed = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => /^(TORQUECORE_|SUPABASE_|WORKER_)/.test(key) && typeof value === 'string',
      ),
    );
    const encrypted = safeStorage.encryptString(JSON.stringify(allowed));
    writeFileSync(this.filePath, encrypted.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  }
}
