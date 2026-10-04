import { Platform } from 'obsidian';
import type { IShortcutCreator } from './IShortcutCreator';
import { WindowsShortcutCreator } from './WindowsShortcutCreator';
import type { ShortcutDestination } from './WindowsShortcutCreator';
import { MacOSShortcutCreator } from './MacOSShortcutCreator';
import { LinuxShortcutCreator } from './LinuxShortcutCreator';

export class ShortcutCreator implements IShortcutCreator {
  private readonly creator: IShortcutCreator | undefined;

  constructor(destination: ShortcutDestination = 'desktop') {
    if (Platform.isDesktopApp) {
      if (destination === 'start-menu' && !Platform.isWin) return;
      if (Platform.isWin) this.creator = new WindowsShortcutCreator(destination);
      else if (Platform.isMacOS) this.creator = new MacOSShortcutCreator();
      else if (Platform.isLinux) this.creator = new LinuxShortcutCreator();
    }
  }

  async createVaultShortcut(vaultName: string): Promise<string> {
    return this.getCreator().createVaultShortcut(vaultName);
  }

  async createNoteShortcut(vaultName: string, notePath: string): Promise<string> {
    return this.getCreator().createNoteShortcut(vaultName, notePath);
  }

  private getCreator(): IShortcutCreator {
    if (!this.creator) throw new Error('Desktop shortcuts are unavailable on this platform.');
    return this.creator;
  }

  async createTagShortcut(vaultName: string, tag: string): Promise<string> {
    return this.getCreator().createTagShortcut(vaultName, tag);
  }
}
