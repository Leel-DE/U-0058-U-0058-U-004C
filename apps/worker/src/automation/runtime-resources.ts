import { BrowserLauncher } from './browser-launcher.js';
import { BrowserContextManager } from './browser-context-manager.js';
import { PersistentProfileManager } from './persistent-profile-manager.js';

export const browserLauncher = new BrowserLauncher();
export const browserContextManager = new BrowserContextManager(browserLauncher);
export const persistentProfileManager = new PersistentProfileManager();

export async function closeBrowserAutomationCore() {
  await browserContextManager.closeAll();
  await browserLauncher.close();
}
