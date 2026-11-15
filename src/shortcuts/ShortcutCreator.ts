import { Platform } from 'obsidian';
import type { IShortcutCreator, ShortcutOptions } from './IShortcutCreator';
import { WindowsShortcutCreator } from './WindowsShortcutCreator';
import type { ShortcutDestination } from './WindowsShortcutCreator';
import { MacOSShortcutCreator } from './MacOSShortcutCreator';
import { LinuxShortcutCreator } from './LinuxShortcutCreator';
import type { ShortcutContext, ShortcutRequest } from './requests';

export class ShortcutCreator implements IShortcutCreator {
  private readonly creator: IShortcutCreator | undefined;

  async createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string> {
    return this.getCreator().createShortcut(request, label, options, context);
  }

  constructor(destination: ShortcutDestination = 'desktop') {
    if (Platform.isDesktopApp) {
      if (destination === 'start-menu' && !Platform.isWin) return;
      if (Platform.isWin) this.creator = new WindowsShortcutCreator(destination);
      else if (Platform.isMacOS) this.creator = new MacOSShortcutCreator();
      else if (Platform.isLinux) this.creator = new LinuxShortcutCreator();
    }
  }

  async createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string> {
    return this.getCreator().createVaultShortcut(vaultName, options);
  }

  async createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string> {
    return this.getCreator().createNoteShortcut(vaultName, notePath, options);
  }

  private getCreator(): IShortcutCreator {
    if (!this.creator) throw new Error('Desktop shortcuts are unavailable on this platform.');
    return this.creator;
  }

  async createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string> {
    return this.getCreator().createTagShortcut(vaultName, tag, options);
  }
}
