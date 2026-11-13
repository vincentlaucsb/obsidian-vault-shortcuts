import { FileSystemAdapter, getAllTags, MarkdownView, Menu, Notice, Platform, Plugin, PluginSettingTab, TFile } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { ShortcutCreator } from './shortcuts/ShortcutCreator';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';
import { OtherVaultModal } from './OtherVaultModal';
import { TagShortcutModal } from './TagShortcutModal';
import { addIconControl, readIcon } from './IconControl';
import type { IconSelection } from './IconControl';
import { ShortcutOptionsModal } from './ShortcutOptionsModal';
import { readDefaultIcon } from './settings';
import { readContextMenuOptions } from './settings';
import type { ContextMenuOptions } from './settings';
import { buildShortcutUri } from './shortcuts/requests';
import type { ShortcutContext, ShortcutRequest } from './shortcuts/requests';
import { verifyVaultId } from './vaultIdentity';

export default class VaultShortcuts extends Plugin {
  private readonly creator = new ShortcutCreator();
  private readonly startMenuCreator = new ShortcutCreator('start-menu');
  private readonly populatedMenus = new WeakSet<Menu>();

  contextMenuOptions = readContextMenuOptions(undefined);
  defaultIcon: string | undefined;
  private settingsSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    try {
      const data: unknown = await this.loadData();
      this.contextMenuOptions = readContextMenuOptions(data);
      this.defaultIcon = readDefaultIcon(data);
    } catch {
      new Notice('Could not load context menu options. Using defaults.');
    }
    this.addSettingTab(new VaultShortcutsSettings(this));
    this.addCommand({
      id: 'create-vault-shortcut',
      name: 'Create shortcut to this vault',
      callback: async () => { await this.createShortcut(); },
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
    if (this.contextMenuOptions.desktop || (Platform.isWin && this.contextMenuOptions.startMenu)) {
      menu.addItem(item => item.setTitle('Create shortcut with options…').setIcon('settings-2')
        .onClick(() => this.openShortcutOptions(file, this.contextMenuOptions.desktop ? 'desktop' : 'start-menu')));
    }
    if (this.contextMenuOptions.tags && this.getNoteTags(file).length) {
      menu.addItem(item => item.setTitle('Create tag shortcut').setIcon('tags')
        .onClick(() => {
          const tags = this.getNoteTags(file);
          if (!tags.length) {
            new Notice('This note has no available tags. Reopen its context menu and try again.');
            return;
          }
          new TagShortcutModal(this.app, tags, (tag, target, icon) => this.createTagShortcut(tag, target, icon), this.defaultIcon,
            (tag, target, icon) => this.openPresetOptions({ action: 'search', vault: this.app.vault.getName(), query: `tag:${tag}` }, target, icon)).open();
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

  private async createTagShortcut(tag: string, target: ShortcutDestination, icon: IconSelection = { mode: 'default' }): Promise<boolean> {
    try {
      const creator = target === 'start-menu' ? this.startMenuCreator : this.creator;
      const destination = await creator.createTagShortcut(this.app.vault.getName(), tag, { iconPath: await this.resolveIcon(icon) });
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
      await this.saveData({ ...next, ...(this.defaultIcon ? { defaultIcon: this.defaultIcon } : {}) });
      this.contextMenuOptions = next;
    });
    this.settingsSave = save.catch(() => {});
    return save;
  }

  async saveDefaultIcon(selection: IconSelection): Promise<void> {
    const path = selection.mode === 'custom' ? selection.path : undefined;
    const save = this.settingsSave.then(async () => {
      await this.saveData({ ...this.contextMenuOptions, ...(path ? { defaultIcon: path } : {}) });
      this.defaultIcon = path;
    });
    this.settingsSave = save.catch(() => {});
    return save;
  }

  openShortcutOptions(file?: TFile, target: ShortcutDestination = 'desktop'): void {
    const vault = this.app.vault.getName();
    let context: ShortcutContext = file ? { kind: 'file', vault, file: file.path, markdown: file.extension.toLowerCase() === 'md' } :
      { kind: 'general', currentVault: vault };
    new ShortcutOptionsModal(this.app, {
      context, defaultIcon: this.defaultIcon, target,
      headingSuggestions: file ? this.app.metadataCache.getFileCache(file)?.headings?.map(heading => heading.heading) : undefined,
      blockSuggestions: file ? Object.keys(this.app.metadataCache.getFileCache(file)?.blocks ?? {}) : undefined,
      verifyVaultId: file ? async value => {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) throw new Error('Vault ID verification requires a local filesystem vault. Use the vault name.');
        const id = await verifyVaultId(value, adapter.getBasePath(), Platform.isWin);
        if (context.kind !== 'file') throw new Error('Reopen the clicked file’s shortcut dialog.');
        context = { ...context, vaultId: id };
        return id;
      } : undefined,
      create: (request, label, destination, icon) => this.createConfiguredShortcut(request, label, destination, icon, context, file),
    }).open();
  }

  openPresetOptions(request: ShortcutRequest, target: ShortcutDestination, initialIcon: IconSelection, selectedVault = this.app.vault.getName()): void {
    const currentVault = this.app.vault.getName();
    const context: ShortcutContext = { kind: 'general', currentVault, targetVault: selectedVault };
    new ShortcutOptionsModal(this.app, {
      context, initialRequest: request, initialIcon, target, defaultIcon: selectedVault === currentVault ? this.defaultIcon : undefined,
      create: (next, label, destination, icon) => this.createConfiguredShortcut(next, label, destination, icon, context),
    }).open();
  }

  private async createConfiguredShortcut(
    request: ShortcutRequest, label: string, target: ShortcutDestination, icon: IconSelection,
    context: ShortcutContext, file?: TFile,
  ): Promise<boolean> {
    try {
      buildShortcutUri(request, context);
      const options = { iconPath: await this.resolveIcon(icon) };
      if (context.kind === 'file' && (!file || file.path !== context.file || this.app.vault.getAbstractFileByPath(context.file) !== file)) {
        throw new Error('This file changed or no longer exists. Reopen its context menu and try again.');
      }
      const creator = target === 'start-menu' ? this.startMenuCreator : this.creator;
      const destination = await creator.createShortcut(request, label, options, context);
      new Notice(`Shortcut created: ${destination}`, 7000);
      return true;
    } catch (error: unknown) {
      new Notice(`Could not create shortcut: ${error instanceof Error ? error.message : String(error)}`, 10000);
      return false;
    }
  }

  private async resolveIcon(selection: IconSelection): Promise<string | undefined> {
    const path = selection.mode === 'custom' ? selection.path : selection.mode === 'default' ? this.defaultIcon : undefined;
    if (path) {
      try { await readIcon(path); }
      catch { throw new Error('Selected icon is unavailable on this computer. Choose another image or use the Obsidian icon in shortcut options.'); }
    }
    return path;
  }

  async createShortcut(file?: TFile, target: ShortcutDestination = 'desktop', otherVaultName?: string, icon?: IconSelection): Promise<boolean> {
    try {
      if (file && this.app.vault.getAbstractFileByPath(file.path) !== file) {
        throw new Error('This file no longer exists. Reopen its context menu and try again.');
      }
      const vaultName = otherVaultName ?? this.app.vault.getName();
      const creator = target === 'start-menu' ? this.startMenuCreator : this.creator;
      const options = { iconPath: await this.resolveIcon(icon ?? { mode: otherVaultName ? 'standard' : 'default' }) };
      const destination = file ? await creator.createNoteShortcut(vaultName, file.path, options) :
        await creator.createVaultShortcut(vaultName, options);
      new Notice(`Shortcut created: ${destination}`, 7000);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not create shortcut: ${message}`, 10000);
      return false;
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
        setting.setClass('vault-shortcuts-stacked-setting');
        setting.addButton(button => button.setButtonText('Create shortcut').onClick(async () => {
          button.setDisabled(true);
          try { await this.vaultShortcuts.createShortcut(); }
          finally { button.setDisabled(false); }
        }));
        setting.addButton(button => button.setButtonText('Create shortcut with options…')
          .onClick(() => { this.vaultShortcuts.openShortcutOptions(); }));
        if (Platform.isWin) {
          setting.addButton(button => button.setButtonText('Create start menu shortcut').onClick(async () => {
            button.setDisabled(true);
            try { await this.vaultShortcuts.createShortcut(undefined, 'start-menu'); }
            finally { button.setDisabled(false); }
          }));
        }
      },
    }, {
      name: 'Default shortcut icon',
      desc: 'Choose an icon for new shortcuts in this vault. Existing shortcuts keep their icons.',
      render: setting => {
        setting.setClass('vault-shortcuts-stacked-setting');
        setting.controlEl.addClass('vault-shortcuts-settings-icon');
        addIconControl(setting.controlEl, this.vaultShortcuts.defaultIcon ?
          { mode: 'custom', path: this.vaultShortcuts.defaultIcon } : { mode: 'standard' },
          selection => this.vaultShortcuts.saveDefaultIcon(selection), undefined, false);
      },
    }, {
      name: 'Other vaults',
      desc: 'Create a vault shortcut without installing this plugin in the other vault.',
      render: setting => {
        setting.setClass('vault-shortcuts-stacked-setting');
        setting.addButton(button => button.setButtonText('Create shortcut to another vault').onClick(() => {
          new OtherVaultModal(this.app, async (name, target, icon) => {
            await this.vaultShortcuts.createShortcut(undefined, target, name, icon);
          }, (name, target, icon) => this.vaultShortcuts.openPresetOptions({ action: 'open', target: { kind: 'vault', vault: name } }, target, icon, name)).open();
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
