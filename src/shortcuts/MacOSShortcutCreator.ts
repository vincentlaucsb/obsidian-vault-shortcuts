import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { getMacOSDesktop } from './desktop';
import { writeRequestShortcut, writeShortcut, writeTagShortcut } from './files';
import type { ShortcutContext, ShortcutRequest } from './requests';

export class MacOSShortcutCreator implements IShortcutCreator {
  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    return writeRequestShortcut(await getMacOSDesktop(), 'url', request, label, options, context);
  }

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
