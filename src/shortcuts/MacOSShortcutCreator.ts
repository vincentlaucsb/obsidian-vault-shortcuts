import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { getMacOSDesktop } from './desktop';
import { writeRequestShortcut, writeShortcut, writeTagShortcut } from './files';
import type { ShortcutContext, ShortcutRequest } from './requests';
import { createMacShortcutWithIcon } from './macIcon';

export class MacOSShortcutCreator implements IShortcutCreator {
  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    const directory = await getMacOSDesktop();
    return createMacShortcutWithIcon(() => writeRequestShortcut(directory, 'url', request, label, undefined, context), options?.iconPath);
  }

  async createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string> {
    const directory = await getMacOSDesktop();
    return createMacShortcutWithIcon(() => writeTagShortcut(directory, 'url', vaultName, tag), options?.iconPath);
  }

  async createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string> {
    const directory = await getMacOSDesktop();
    return createMacShortcutWithIcon(() => writeShortcut(directory, 'url', vaultName), options?.iconPath);
  }

  async createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string> {
    const directory = await getMacOSDesktop();
    return createMacShortcutWithIcon(() => writeShortcut(directory, 'url', vaultName, notePath), options?.iconPath);
  }
}
