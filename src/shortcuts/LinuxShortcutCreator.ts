import type { IShortcutCreator } from './IShortcutCreator';
import { getLinuxDesktop } from './desktop';
import { writeShortcut, writeTagShortcut } from './files';

export class LinuxShortcutCreator implements IShortcutCreator {
  async createTagShortcut(vaultName: string, tag: string): Promise<string> {
    return writeTagShortcut(await getLinuxDesktop(), 'desktop', vaultName, tag);
  }

  async createVaultShortcut(vaultName: string): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName, notePath);
  }
}
