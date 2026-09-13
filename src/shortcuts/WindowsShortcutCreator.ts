import type { IShortcutCreator } from './IShortcutCreator';
import { getWindowsDesktop, getWindowsStartMenu } from './desktop';
import { writeShortcut } from './files';
import { writeWindowsStartMenuShortcut } from './windowsLink';

export type ShortcutDestination = 'desktop' | 'start-menu';

export class WindowsShortcutCreator implements IShortcutCreator {
  constructor(private readonly destination: ShortcutDestination = 'desktop') {}

  async createVaultShortcut(vaultName: string): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeWindowsStartMenuShortcut(await getWindowsStartMenu(), vaultName);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    if (this.destination === 'start-menu') {
      return writeWindowsStartMenuShortcut(await getWindowsStartMenu(), vaultName, notePath);
    }
    return writeShortcut(await getWindowsDesktop(), 'url', vaultName, notePath);
  }
}
