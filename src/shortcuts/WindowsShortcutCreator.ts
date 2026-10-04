import type { IShortcutCreator } from './IShortcutCreator';
import { getWindowsDesktop, getWindowsStartMenu } from './desktop';
import { writeShortcut, writeTagShortcut } from './files';

export type ShortcutDestination = 'desktop' | 'start-menu';

export class WindowsShortcutCreator implements IShortcutCreator {
  constructor(private readonly destination: ShortcutDestination = 'desktop') {}

  async createTagShortcut(vaultName: string, tag: string): Promise<string> {
    const directory = this.destination === 'start-menu' ? await getWindowsStartMenu() : await getWindowsDesktop();
    return writeTagShortcut(directory, 'url', vaultName, tag);
  }

  async createVaultShortcut(vaultName: string): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeShortcut(await getWindowsStartMenu(), 'url', vaultName);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeShortcut(await getWindowsStartMenu(), 'url', vaultName, notePath);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName, notePath);
  }
}
