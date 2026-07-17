import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export class PersistentProfileManager {
  private readonly root =
    process.env.AUTOMATION_PROFILE_DIR ?? path.join(process.cwd(), '.automation-profiles');

  async profilePath(scope: string) {
    const safeScope = scope
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 80);
    const target = path.join(this.root, safeScope || 'default');
    await mkdir(target, { recursive: true });
    return target;
  }
}
