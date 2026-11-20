import { FileSystemAdapter, getAllTags, MarkdownView, Menu, Notice, Platform, Plugin, PluginSettingTab, TFile, TFolder } from 'obsidian';
import type { ButtonComponent, SettingDefinitionItem } from 'obsidian';
import { ShortcutCreator } from './shortcuts/ShortcutCreator';
import type { IShortcutCreator } from './shortcuts/IShortcutCreator';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';
import { OtherVaultModal } from './OtherVaultModal';
import { TagShortcutModal } from './TagShortcutModal';
import { addIconControl } from './icons/IconControl';
import { readIcon } from './icons/assets';
import { iconPlatform, resolveIconPath } from './icons/image';
import type { IconSelection } from './icons/image';
import { ShortcutOptionsModal } from './ShortcutOptionsModal';
import { readDefaultIcon, readSendToFolder } from './settings';
import { readContextMenuOptions } from './settings';
import type { ContextMenuOptions } from './settings';
import { buildShortcutUri } from './shortcuts/requests';
import type { ShortcutContext, ShortcutRequest } from './shortcuts/requests';
import { verifyVaultId } from './vaultIdentity';
import { AgentIntegrationService } from './agents/AgentIntegrationService';
import { isRequestId } from './agents/mailbox';
import { AGENT_ACTION } from './agents/skill';
import { SendToCapture } from './sendTo/SendToCapture';
import { readCaptureFolder } from './sendTo/importImage';

type AgentSettingAction = 'enable' | 'testConnection' | 'remove';

export default class VaultShortcuts extends Plugin {
  private readonly creator = new ShortcutCreator();
  private readonly startMenuCreator = new ShortcutCreator('start-menu');
  private readonly populatedMenus = new WeakSet<Menu>();

  contextMenuOptions = readContextMenuOptions(undefined);
  defaultIcon: string | undefined;
  sendToFolder = '';
  private settingsSave: Promise<void> = Promise.resolve();
  private agents?: AgentIntegrationService;
  private sendTo?: SendToCapture;
  private unloaded = false;

  async onload(): Promise<void> {
    try {
      const data: unknown = await this.loadData();
      this.contextMenuOptions = readContextMenuOptions(data);
      this.defaultIcon = readDefaultIcon(data);
      this.sendToFolder = readCaptureFolder(readSendToFolder(data));
    } catch {
      new Notice('Could not load context menu options. Using defaults.');
    }
    this.addSettingTab(new VaultShortcutsSettings(this));
    if (Platform.isWin && this.manifest.dir && this.app.vault.adapter instanceof FileSystemAdapter) {
      this.app.workspace.onLayoutReady(() => {
        if (!this.unloaded) void this.updateSendTo('restore');
      });
    }
    if (this.manifest.dir && this.app.vault.adapter instanceof FileSystemAdapter) {
      this.registerObsidianProtocolHandler(AGENT_ACTION, ({ request }) => {
        if (!isRequestId(request)) return;
        this.app.workspace.onLayoutReady(() => {
          if (this.unloaded) return;
          void this.receiveAgentRequest(request).catch((error: unknown) => {
            new Notice(`Could not receive agent request: ${error instanceof Error ? error.message : String(error)}`);
          });
        });
      });
    }
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
      else if (file instanceof TFolder) this.addFolderMenu(menu, file);
    }));
  }

  onunload(): void {
    this.unloaded = true;
    this.agents?.dispose();
    this.sendTo?.dispose();
  }

  async updateSendTo(action: 'enable' | 'remove' | 'restore'): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (!Platform.isWin || !(adapter instanceof FileSystemAdapter)) throw new Error('This feature requires Windows and a local vault.');
      this.sendTo ??= new SendToCapture(this.app, adapter.getBasePath(), () => this.sendToFolder,
        message => { if (!this.unloaded) new Notice(message, 9000); });
      await this.sendTo[action]();
    } catch (error: unknown) {
      new Notice(`Windows Send to: ${error instanceof Error ? error.message : String(error)}`, 10000);
    }
  }

  private getAgents(): AgentIntegrationService {
    if (!this.manifest.dir) throw new Error('Could not find the active Vault Shortcuts plugin directory.');
    return this.agents ??= new AgentIntegrationService(this.app, this.manifest.dir,
      destination => this.creatorForDestination(destination),
      selection => this.resolveIcon(selection));
  }

  private async receiveAgentRequest(id: string): Promise<void> {
    await this.getAgents().receive(id);
  }

  async updateAgentIntegration(action: AgentSettingAction): Promise<void> {
    try {
      const result = await this.getAgents()[action]();
      const message = {
        enable: 'Agent integration enabled. Start a fresh agent at the vault root.',
        testConnection: 'The local agent handoff responded to help.',
        remove: 'Agent integration disabled. Unchanged installed skills were removed.',
      }[action];
      new Notice(result?.length ? `${message} Edited or linked skills were preserved: ${result.join(', ')}` : message, 9000);
    } catch (error: unknown) {
      new Notice(`Agent integration: ${error instanceof Error ? error.message : String(error)}`, 10000);
    }
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

  private addFolderMenu(menu: Menu, folder: TFolder): void {
    if (this.populatedMenus.has(menu)) return;
    this.populatedMenus.add(menu);
    if (!this.contextMenuOptions.desktop && !(Platform.isWin && this.contextMenuOptions.startMenu)) return;
    menu.addItem(item => item.setTitle('Create folder shortcut…').setIcon('folder-plus').onClick(() => {
      const context: ShortcutContext = { kind: 'folder', vault: this.app.vault.getName(), folder: folder.isRoot() ? '' : folder.path };
      new ShortcutOptionsModal(this.app, {
        context, defaultIcon: this.defaultIcon, target: this.contextMenuOptions.desktop ? 'desktop' : 'start-menu',
        create: (request, label, target, icon) => this.createConfiguredShortcut(request, label, target, icon, context, folder),
      }).open();
    }));
  }

  private getNoteTags(file: TFile): string[] {
    if (file.extension.toLowerCase() !== 'md' || this.app.vault.getAbstractFileByPath(file.path) !== file) return [];
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache ? getAllTags(cache) ?? [] : [];
    const unique = new Map<string, string>();
    for (const tag of tags) if (!unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }

  private createTagShortcut(tag: string, target: ShortcutDestination, icon: IconSelection = { mode: 'default' }): Promise<boolean> {
    return this.runShortcutCreation(target, async creator =>
      creator.createTagShortcut(this.app.vault.getName(), tag, { iconPath: await this.resolveIcon(icon) }));
  }

  saveContextMenuOption(key: keyof ContextMenuOptions, enabled: boolean): Promise<void> {
    return this.queueSettingsSave(async () => {
      const next = { ...this.contextMenuOptions, [key]: enabled };
      await this.saveSettings(next, this.defaultIcon, this.sendToFolder);
      this.contextMenuOptions = next;
    });
  }

  saveDefaultIcon(selection: IconSelection): Promise<void> {
    const path = selection.mode === 'custom' ? selection.path : undefined;
    return this.queueSettingsSave(async () => {
      await this.saveSettings(this.contextMenuOptions, path, this.sendToFolder);
      this.defaultIcon = path;
    });
  }

  saveSendToFolder(value: string): Promise<void> {
    return this.queueSettingsSave(async () => {
      const folder = readCaptureFolder(value);
      if (folder && !this.app.vault.getFolderByPath(folder)) throw new Error('That folder does not exist in this vault.');
      await this.saveSettings(this.contextMenuOptions, this.defaultIcon, folder);
      this.sendToFolder = folder;
    });
  }

  private queueSettingsSave(write: () => Promise<void>): Promise<void> {
    const save = this.settingsSave.then(write);
    this.settingsSave = save.catch(() => {});
    return save;
  }

  private async saveSettings(context: ContextMenuOptions, icon: string | undefined, folder: string): Promise<void> {
    await this.saveData({ ...context, ...(icon ? { defaultIcon: icon } : {}), ...(folder ? { sendToFolder: folder } : {}) });
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

  private createConfiguredShortcut(
    request: ShortcutRequest, label: string, target: ShortcutDestination, icon: IconSelection,
    context: ShortcutContext, file?: TFile | TFolder,
  ): Promise<boolean> {
    return this.runShortcutCreation(target, async creator => {
      buildShortcutUri(request, context);
      const options = { iconPath: await this.resolveIcon(icon) };
      if (context.kind === 'file' && (!file || file.path !== context.file || this.app.vault.getAbstractFileByPath(context.file) !== file)) {
        throw new Error('This file changed or no longer exists. Reopen its context menu and try again.');
      }
      if (context.kind === 'folder' && (!(file instanceof TFolder) || (file.isRoot() ? '' : file.path) !== context.folder ||
          (file.isRoot() ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(file.path)) !== file)) {
        throw new Error('This folder changed or no longer exists. Reopen its context menu and try again.');
      }
      return creator.createShortcut(request, label, options, context);
    });
  }

  private async resolveIcon(selection: IconSelection): Promise<string | undefined> {
    const path = resolveIconPath(selection, this.defaultIcon);
    if (path) {
      try { await readIcon(path, iconPlatform()); }
      catch { throw new Error('Selected icon is unavailable on this computer. Choose another image or use the Obsidian icon in shortcut options.'); }
    }
    return path;
  }

  createShortcut(file?: TFile, target: ShortcutDestination = 'desktop', otherVaultName?: string, icon?: IconSelection): Promise<boolean> {
    return this.runShortcutCreation(target, async creator => {
      if (file && this.app.vault.getAbstractFileByPath(file.path) !== file) {
        throw new Error('This file no longer exists. Reopen its context menu and try again.');
      }
      const vaultName = otherVaultName ?? this.app.vault.getName();
      const options = { iconPath: await this.resolveIcon(icon ?? { mode: otherVaultName ? 'standard' : 'default' }) };
      return file ? creator.createNoteShortcut(vaultName, file.path, options) : creator.createVaultShortcut(vaultName, options);
    });
  }

  private creatorForDestination(destination: ShortcutDestination): IShortcutCreator {
    return destination === 'start-menu' ? this.startMenuCreator : this.creator;
  }

  private async runShortcutCreation(
    target: ShortcutDestination, create: (creator: IShortcutCreator) => Promise<string>,
  ): Promise<boolean> {
    try {
      const destination = await create(this.creatorForDestination(target));
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
    }, {
      name: 'Agent integration',
      desc: 'Install vault skills for Obsidian Copilot, Claude Code and Codex. Requests can open or focus this vault.',
      visible: Platform.isDesktopApp && (Platform.isWin || Platform.isMacOS || Platform.isLinux),
      render: setting => {
        setting.setClass('vault-shortcuts-stacked-setting');
        const buttons: ButtonComponent[] = [];
        for (const [text, action] of [
          ['Enable or repair', 'enable'], ['Test connection', 'testConnection'], ['Remove', 'remove'],
        ] as const) {
          setting.addButton(button => {
            buttons.push(button.setButtonText(text).onClick(async () => {
              for (const control of buttons) control.setDisabled(true);
              try { await this.vaultShortcuts.updateAgentIntegration(action); }
              finally { for (const control of buttons) control.setDisabled(false); }
            }));
          });
        }
      },
    }, {
      type: 'group',
      heading: 'Windows Send to',
      visible: Platform.isWin,
      items: [{
        name: 'File Explorer entries',
        desc: `Send an image to a new note or today’s daily note in ${this.app.vault.getName()}. Daily capture requires Daily notes and the command line interface.`,
        render: setting => {
          setting.setClass('vault-shortcuts-stacked-setting');
          const controls: ButtonComponent[] = [];
          for (const [label, action] of [['Install Send to entries', 'enable'], ['Remove Send to entries', 'remove']] as const) {
            setting.addButton(button => {
              controls.push(button.setButtonText(label).onClick(async () => {
                for (const control of controls) control.setDisabled(true);
                try { await this.vaultShortcuts.updateSendTo(action); }
                finally { for (const control of controls) control.setDisabled(false); }
              }));
            });
          }
        },
      }, {
        name: 'New note folder',
        desc: 'Enter an existing folder path in this vault. Leave it blank for the vault root.',
        render: setting => {
          setting.setClass('vault-shortcuts-stacked-setting');
          let value = this.vaultShortcuts.sendToFolder;
          setting.addText(text => text.setValue(value).setPlaceholder('Vault root').onChange(next => { value = next; }));
          setting.addButton(button => button.setButtonText('Save folder').onClick(async () => {
            button.setDisabled(true);
            try {
              await this.vaultShortcuts.saveSendToFolder(value);
              new Notice('New note folder saved.');
            } catch (error: unknown) {
              new Notice(error instanceof Error ? error.message : 'Could not save the folder.');
            } finally { button.setDisabled(false); }
          }));
        },
      }],
    }];
  }
}
