export interface IShortcutCreator {
  createVaultShortcut(vaultName: string): Promise<string>;
  createNoteShortcut(vaultName: string, notePath: string): Promise<string>;
}
