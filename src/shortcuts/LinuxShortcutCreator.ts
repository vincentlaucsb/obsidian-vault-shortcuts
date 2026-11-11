import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { getLinuxDesktop } from './desktop';
import { writeRequestShortcut, writeShortcut, writeTagShortcut } from './files';
import type { ShortcutContext, ShortcutRequest } from './requests';

export class LinuxShortcutCreator implements IShortcutCreator {
  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    return writeRequestShortcut(await getLinuxDesktop(), 'desktop', request, label, options, context);
  }

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
