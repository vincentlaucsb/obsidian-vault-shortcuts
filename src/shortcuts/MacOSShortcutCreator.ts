import type { IShortcutCreator } from './IShortcutCreator';
import { getMacOSDesktop } from './desktop';
import { writeShortcut } from './files';

export class MacOSShortcutCreator implements IShortcutCreator {
  async createVaultShortcut(vaultName: string): Promise<string> {
    return writeShortcut(await getMacOSDesktop(), 'url', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    return writeShortcut(await getMacOSDesktop(), 'url', vaultName, notePath);
  }
}
