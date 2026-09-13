import { MarkdownView, Menu, Notice, Platform, Plugin, PluginSettingTab, TFile } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { ShortcutCreator } from './shortcuts/ShortcutCreator';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';
import { OtherVaultModal } from './OtherVaultModal';

export default class VaultShortcuts extends Plugin {
  private readonly creator = new ShortcutCreator();
  private readonly startMenuCreator = new ShortcutCreator('start-menu');
  private readonly populatedMenus = new WeakSet<Menu>();

  onload(): void {
    this.addSettingTab(new VaultShortcutsSettings(this));
    this.addCommand({
      id: 'create-vault-shortcut',
      name: 'Create shortcut to this vault',
      callback: () => this.createShortcut(),
    });
    this.addCommand({
      id: 'create-note-shortcut',
      name: 'Create shortcut to current note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file || file.extension.toLowerCase() !== 'md') return false;
        if (!checking) void this.createShortcut(file);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile) this.addNoteMenu(menu, file);
    }));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, _editor, info) => {
      if (info.file) this.addNoteMenu(menu, info.file);
    }));
  }

  private addNoteMenu(menu: Menu, file: TFile): void {
    if (file.extension.toLowerCase() !== 'md' || this.populatedMenus.has(menu)) return;
    this.populatedMenus.add(menu);
    menu.addItem(item => item.setTitle('Create desktop shortcut').setIcon('external-link')
      .onClick(() => this.createShortcut(file)));
    if (Platform.isWin) {
      menu.addItem(item => item.setTitle('Create start menu shortcut').setIcon('external-link')
        .onClick(() => this.createShortcut(file, 'start-menu')));
    }
  }

  async createShortcut(file?: TFile, target: ShortcutDestination = 'desktop', otherVaultName?: string): Promise<void> {
    try {
      if (file && this.app.vault.getAbstractFileByPath(file.path) !== file) {
        throw new Error('This note no longer exists. Reopen its context menu and try again.');
      }
      const vaultName = otherVaultName ?? this.app.vault.getName();
      const creator = target === 'start-menu' ? this.startMenuCreator : this.creator;
      const destination = file ? await creator.createNoteShortcut(vaultName, file.path) :
        await creator.createVaultShortcut(vaultName);
      new Notice(`Shortcut created: ${destination}`, 7000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not create shortcut: ${message}`, 10000);
    }
  }
}

class VaultShortcutsSettings extends PluginSettingTab {
  constructor(private readonly vaultShortcuts: VaultShortcuts) {
    super(vaultShortcuts.app, vaultShortcuts);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      name: 'Create vault shortcut',
      desc: Platform.isWin ? `Create a shortcut to ${this.app.vault.getName()} on the desktop or in the start menu.` :
        `Create a desktop shortcut to ${this.app.vault.getName()}.`,
      render: setting => {
        setting.addButton(button => button.setButtonText('Create shortcut').onClick(async () => {
          button.setDisabled(true);
          try { await this.vaultShortcuts.createShortcut(); }
          finally { button.setDisabled(false); }
        }));
        if (Platform.isWin) {
          setting.addButton(button => button.setButtonText('Create start menu shortcut').onClick(async () => {
            button.setDisabled(true);
            try { await this.vaultShortcuts.createShortcut(undefined, 'start-menu'); }
            finally { button.setDisabled(false); }
          }));
        }
      },
    }, {
      name: 'Other vaults',
      desc: 'Create a vault shortcut without installing this plugin in the other vault.',
      render: setting => {
        setting.addButton(button => button.setButtonText('Create shortcut to another vault').onClick(() => {
          new OtherVaultModal(this.app, (name, target) =>
            this.vaultShortcuts.createShortcut(undefined, target, name)).open();
        }));
      },
    }];
  }
}
