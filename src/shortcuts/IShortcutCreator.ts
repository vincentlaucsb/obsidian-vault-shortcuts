export interface ShortcutOptions {
  iconPath?: string;
}

export interface IShortcutCreator {
  createVaultShortcut(vaultName: string, options?: ShortcutOptions): Promise<string>;
  createNoteShortcut(vaultName: string, notePath: string, options?: ShortcutOptions): Promise<string>;
  createTagShortcut(vaultName: string, tag: string, options?: ShortcutOptions): Promise<string>;
}
