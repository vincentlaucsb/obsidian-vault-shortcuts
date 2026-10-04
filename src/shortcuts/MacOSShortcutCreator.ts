import type { IShortcutCreator } from './IShortcutCreator';
import { getMacOSDesktop } from './desktop';
import { writeShortcut, writeTagShortcut } from './files';

export class MacOSShortcutCreator implements IShortcutCreator {
  async createTagShortcut(vaultName: string, tag: string): Promise<string> {
    return writeTagShortcut(await getMacOSDesktop(), 'url', vaultName, tag);
  }

  async createVaultShortcut(vaultName: string): Promise<string> {
    return writeShortcut(await getMacOSDesktop(), 'url', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    return writeShortcut(await getMacOSDesktop(), 'url', vaultName, notePath);
  }
}
