import type { ShortcutContext, ShortcutRequest } from './requests';

export interface ShortcutOptions {
  iconPath?: string;
}

export interface IShortcutCreator {
  createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string>;
  createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string>;
  createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string>;
  createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string>;
}
