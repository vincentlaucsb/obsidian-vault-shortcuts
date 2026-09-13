import type { IShortcutCreator } from './IShortcutCreator';
import { getLinuxDesktop } from './desktop';
import { writeShortcut } from './files';

export class LinuxShortcutCreator implements IShortcutCreator {
  async createVaultShortcut(vaultName: string): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName, notePath);
  }
}
