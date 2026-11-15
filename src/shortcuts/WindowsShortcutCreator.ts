import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { getWindowsDesktop, getWindowsStartMenu } from './desktop';
import { writeRequestShortcut, writeShortcut, writeTagShortcut } from './files';
import type { ShortcutContext, ShortcutRequest } from './requests';

export type ShortcutDestination = 'desktop' | 'start-menu';

export class WindowsShortcutCreator implements IShortcutCreator {
  constructor(private readonly destination: ShortcutDestination = 'desktop') {}

  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    const directory = this.destination === 'start-menu' ? await getWindowsStartMenu() : await getWindowsDesktop();
    return writeRequestShortcut(directory, 'url', request, label, options, context);
  }

  async createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string> {
    const directory = this.destination === 'start-menu' ? await getWindowsStartMenu() : await getWindowsDesktop();
    return writeTagShortcut(directory, 'url', vaultName, tag, options);
  }

  async createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeShortcut(await getWindowsStartMenu(), 'url', vaultName, undefined, options);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName, undefined, options);
  }

  async createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeShortcut(await getWindowsStartMenu(), 'url', vaultName, notePath, options);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName, notePath, options);
  }
}
