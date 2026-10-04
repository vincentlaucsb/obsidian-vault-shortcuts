import { getAllTags, MarkdownView, Menu, Notice, Platform, Plugin, PluginSettingTab, TFile } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { ShortcutCreator } from './shortcuts/ShortcutCreator';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';
import { OtherVaultModal } from './OtherVaultModal';
import { TagShortcutModal } from './TagShortcutModal';
import { readContextMenuOptions } from './settings';
import type { ContextMenuOptions } from './settings';

export default class VaultShortcuts extends Plugin {
  private readonly creator = new ShortcutCreator();
  private readonly startMenuCreator = new ShortcutCreator('start-menu');
  private readonly populatedMenus = new WeakSet<Menu>();

  contextMenuOptions = readContextMenuOptions(undefined);
  private settingsSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    try {
      const data: unknown = await this.loadData();
      this.contextMenuOptions = readContextMenuOptions(data);
    } catch {
      new Notice('Could not load context menu options. Using defaults.');
    }
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
      if (file instanceof TFile) this.addFileMenu(menu, file);
    }));
  }

  private addFileMenu(menu: Menu, file: TFile): void {
    if (this.populatedMenus.has(menu)) return;
    this.populatedMenus.add(menu);
    if (this.contextMenuOptions.desktop) {
      menu.addItem(item => item.setTitle('Create desktop shortcut').setIcon('external-link')
        .onClick(() => this.createShortcut(file)));
    }
    if (Platform.isWin && this.contextMenuOptions.startMenu) {
      menu.addItem(item => item.setTitle('Create start menu shortcut').setIcon('external-link')
        .onClick(() => this.createShortcut(file, 'start-menu')));
    }
    if (this.contextMenuOptions.tags && this.getNoteTags(file).length) {
      menu.addItem(item => item.setTitle('Create tag shortcut').setIcon('tags')
        .onClick(() => {
          const tags = this.getNoteTags(file);
          if (!tags.length) {
            new Notice('This note has no available tags. Reopen its context menu and try again.');
            return;
          }
          new TagShortcutModal(this.app, tags, (tag, target) => this.createTagShortcut(tag, target)).open();
        }));
    }
  }

  private getNoteTags(file: TFile): string[] {
    if (file.extension.toLowerCase() !== 'md' || this.app.vault.getAbstractFileByPath(file.path) !== file) return [];
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache ? getAllTags(cache) ?? [] : [];
    const unique = new Map<string, string>();
    for (const tag of tags) if (!unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }

  private async createTagShortcut(tag: string, target: ShortcutDestination): Promise<boolean> {
    try {
      const creator = target === 'start-menu' ? this.startMenuCreator : this.creator;
      const destination = await creator.createTagShortcut(this.app.vault.getName(), tag);
      new Notice(`Shortcut created: ${destination}`, 7000);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not create shortcut: ${message}`, 10000);
      return false;
    }
  }

  saveContextMenuOption(key: keyof ContextMenuOptions, enabled: boolean): Promise<void> {
    const save = this.settingsSave.then(async () => {
      const next = { ...this.contextMenuOptions, [key]: enabled };
      await this.saveData(next);
      this.contextMenuOptions = next;
    });
    this.settingsSave = save.catch(() => {});
    return save;
  }

  async createShortcut(file?: TFile, target: ShortcutDestination = 'desktop', otherVaultName?: string): Promise<void> {
    try {
      if (file && this.app.vault.getAbstractFileByPath(file.path) !== file) {
        throw new Error('This file no longer exists. Reopen its context menu and try again.');
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
    }, {
      type: 'group',
      heading: 'Context menu options',
      items: ([
        { key: 'desktop', name: 'Desktop shortcuts', visible: true },
        { key: 'startMenu', name: 'Start menu shortcuts', visible: Platform.isWin },
        { key: 'tags', name: 'Tag shortcuts', visible: true },
      ] as const).map(({ key, name, visible }) => ({
        name,
        visible,
        desc: 'Show this shortcut action in file context menus.',
        render: setting => {
          setting.addToggle(toggle => toggle.setValue(this.vaultShortcuts.contextMenuOptions[key])
            .onChange(async enabled => {
              toggle.setDisabled(true);
              try { await this.vaultShortcuts.saveContextMenuOption(key, enabled); }
              catch {
                toggle.setValue(this.vaultShortcuts.contextMenuOptions[key]);
                new Notice('Could not save context menu options. Please try again.');
              } finally { toggle.setDisabled(false); }
            }));
        },
      })),
    }];
  }
}
