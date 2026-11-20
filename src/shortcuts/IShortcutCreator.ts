import type { ShortcutContext, ShortcutRequest } from './requests';

export interface ShortcutOptions {
  iconPath?: string;
}

export class ShortcutIconError extends Error {
  constructor(readonly path: string, detail: string) {
    super(`Shortcut created at ${path}, but its custom icon could not be applied. The shortcut was kept. ${detail}`);
  }
}

export interface IShortcutCreator {
  createShortcut(request: ShortcutRequest, label: string, options?: ShortcutOptions, context?: ShortcutContext): Promise<string>;
  createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string>;
  createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string>;
  createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string>;
}
