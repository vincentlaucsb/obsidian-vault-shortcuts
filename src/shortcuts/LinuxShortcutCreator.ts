import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { getLinuxDesktop } from './desktop';
import { writeRequestShortcut, writeShortcut, writeTagShortcut } from './files';
import type { ShortcutContext, ShortcutRequest } from './requests';

export class LinuxShortcutCreator implements IShortcutCreator {
  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    return writeRequestShortcut(await getLinuxDesktop(), 'desktop', request, label, options, context);
  }

  async createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string> {
    return writeTagShortcut(await getLinuxDesktop(), 'desktop', vaultName, tag, options);
  }

  async createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName, undefined, options);
  }

  async createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string> {
    return writeShortcut(await getLinuxDesktop(), 'desktop', vaultName, notePath, options);
  }
}
