import assert from 'node:assert/strict';
import type { IconSelection } from '../src/IconControl';
import type { ShortcutDestination } from '../src/shortcuts/WindowsShortcutCreator';
import type { ShortcutOptions } from '../src/shortcuts/IShortcutCreator';
import { iconControls } from './icon-control-fixture';

export const Platform = { isDesktopApp: true, isWin: true, isMacOS: false, isLinux: false };
const notices: string[] = [];
const creations: { os: string; vault: string; path?: string; iconPath?: string }[] = [];
interface TestMetadata { tags?: { tag: string }[]; frontmatter?: { tags: string[] } }
export function getAllTags(cache: TestMetadata): string[] {
  return [...(cache.tags ?? []).map(entry => entry.tag), ...(cache.frontmatter?.tags ?? []).map(tag => `#${tag}`)];
}
export class Notice {
  constructor(message: string) { notices.push(message); }
}
export class TFile {
  constructor(public path: string, public extension = 'md') {}
}
export class MarkdownView { file: TFile | null = null; }
class MenuItem {
  title = '';
  callback: (() => void | Promise<void>) | undefined;
  setTitle(title: string): this { this.title = title; return this; }
  setIcon(): this { return this; }
  onClick(callback: () => void | Promise<void>): this { this.callback = callback; return this; }
}
export class Menu {
  items: MenuItem[] = [];
  addItem(build: (item: MenuItem) => void): void {
    const item = new MenuItem(); build(item); this.items.push(item);
  }
}
type FileHandler = (menu: Menu, file: TFile) => void;
type EditorHandler = (menu: Menu, editor: unknown, info: { file: TFile }) => void;
class Workspace {
  active = new MarkdownView();
  fileHandler: FileHandler | undefined;
  editorHandler: EditorHandler | undefined;
  on(...registration: ['file-menu', FileHandler] | ['editor-menu', EditorHandler]): string {
    const [event, handler] = registration;
    if (event === 'file-menu') this.fileHandler = handler;
    else this.editorHandler = handler;
    return event;
  }
  getActiveViewOfType(): MarkdownView { return this.active; }
}
export class Plugin {
  readonly app = {
    workspace: new Workspace(),
    vault: {
      files: new Map<string, TFile>(),
      getName: () => 'Test vault',
      getAbstractFileByPath(path: string): TFile | undefined { return this.files.get(path); },
    },
    metadataCache: {
      entries: new Map<TFile, TestMetadata>(),
      getFileCache(file: TFile): TestMetadata | null { return this.entries.get(file) ?? null; },
    },
  };
  events: string[] = [];
  data: unknown;
  loadData(): Promise<unknown> { return Promise.resolve(this.data); }
  saveData(data: unknown): Promise<void> { this.data = data; return Promise.resolve(); }
  onload(): Promise<void> { return Promise.resolve(); }
  addSettingTab(): void {}
  addCommand(): void {}
  registerEvent(event: string): void { this.events.push(event); }
}
export class PluginSettingTab {
  constructor(readonly app: Plugin['app']) {}
}
import { Modal, Setting } from './modal-fixture';
export { Modal, Setting } from './modal-fixture';
class Creator {
  constructor(private readonly os: string) {}
  createVaultShortcut(vault: string, options?: ShortcutOptions): Promise<string> {
    creations.push({ os: this.os, vault, ...(options?.iconPath ? { iconPath: options.iconPath } : {}) }); return Promise.resolve('Desktop/shortcut');
  }
  createNoteShortcut(vault: string, path: string, options?: ShortcutOptions): Promise<string> {
    creations.push({ os: this.os, vault, path, ...(options?.iconPath ? { iconPath: options.iconPath } : {}) }); return Promise.resolve('Desktop/shortcut');
  }
  createTagShortcut(vault: string, tag: string, options?: ShortcutOptions): Promise<string> {
    creations.push({ os: this.os, vault, path: tag, ...(options?.iconPath ? { iconPath: options.iconPath } : {}) }); return Promise.resolve('Desktop/shortcut');
  }
}
export class WindowsShortcutCreator extends Creator {
  constructor(destination = 'desktop') { super(destination === 'start-menu' ? 'windows-start-menu' : 'windows'); }
}
export class MacOSShortcutCreator extends Creator { constructor() { super('mac'); } }
export class LinuxShortcutCreator extends Creator { constructor() { super('linux'); } }

interface TestPlugin extends Plugin {
  defaultIcon: string | undefined;
  saveContextMenuOption(key: 'desktop' | 'startMenu' | 'tags', enabled: boolean): Promise<void>;
  saveDefaultIcon(selection: IconSelection): Promise<void>;
  createShortcut(file?: TFile, target?: ShortcutDestination, otherVaultName?: string, icon?: IconSelection): Promise<boolean>;
}

export async function runScenarios(createPlugin: () => TestPlugin): Promise<void> {
  const plugin = createPlugin(); await plugin.onload();
  const a = new TFile('A.md'); const b = new TFile('Folder/B.md');
  plugin.app.vault.files.set(a.path, a); plugin.app.vault.files.set(b.path, b);
  plugin.app.workspace.active.file = a;
  const menu = new Menu();
  plugin.app.workspace.fileHandler?.(menu, b);
  plugin.app.workspace.fileHandler?.(menu, b);
  assert.equal(plugin.app.workspace.editorHandler, undefined, "Editor menus must not be registered");
  assert.equal(menu.items.length, 3, 'Duplicate events must add each destination and options only once');
  await menu.items[0].callback?.();
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Test vault', path: b.path });
  await menu.items[1].callback?.();
  assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', path: b.path });
  for (const extension of ['jpg', 'csv', 'pdf', 'png']) {
    const attachment = new TFile('Attachments/File & name.' + extension, extension);
    plugin.app.vault.files.set(attachment.path, attachment);
    const attachmentMenu = new Menu();
    plugin.app.workspace.fileHandler?.(attachmentMenu, attachment);
    assert.equal(attachmentMenu.items.length, 3);
    await attachmentMenu.items[0].callback?.();
    assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Test vault', path: attachment.path });
    await attachmentMenu.items[1].callback?.();
    assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', path: attachment.path });
  }
  const folderMenu = new Menu();
  plugin.app.workspace.fileHandler?.(folderMenu, { path: 'Attachments', extension: '' });
  assert.equal(folderMenu.items.length, 0, 'Folders must not get file shortcut actions');
  plugin.app.vault.files.delete(b.path);
  await menu.items[0].callback?.();
  assert.equal(creations.length, 0);
  assert.match(notices.pop() ?? '', /no longer exists/);
  plugin.app.vault.files.set(b.path, new TFile(b.path));
  await menu.items[0].callback?.();
  assert.equal(creations.length, 0, 'A different file replacing the deleted note must not be targeted');
  assert.deepEqual(plugin.events, ['file-menu']);
  for (const desktop of [true, false]) {
    for (const startMenu of [true, false]) {
      const configured = createPlugin();
      await configured.onload();
      await Promise.all([
        configured.saveContextMenuOption('desktop', desktop),
        configured.saveContextMenuOption('startMenu', startMenu),
      ]);
      assert.deepEqual(configured.data, { desktop, startMenu, tags: true }, 'Independent preferences must persist');
      const fileMenu = new Menu();
      const editorMenu = new Menu();
      configured.app.workspace.fileHandler?.(fileMenu, a);
      configured.app.workspace.editorHandler?.(editorMenu, undefined, { file: a });
      assert.equal(fileMenu.items.length, Number(desktop) + Number(startMenu) + Number(desktop || startMenu));
      assert.equal(editorMenu.items.length, 0, 'Editor menus must stay unchanged for every toggle combination');
      const reloaded = createPlugin(); reloaded.data = configured.data;
      await reloaded.onload();
      const restoredMenu = new Menu(); reloaded.app.workspace.fileHandler?.(restoredMenu, a);
      assert.equal(restoredMenu.items.length, fileMenu.items.length, 'Preferences survive reload');
    }
  }
  const icons = createPlugin(); await icons.onload();
  const defaultPath = 'C:\\Icons\\default.ico';
  const overridePath = 'C:\\Icons\\override.ico';
  await Promise.all([
    icons.saveDefaultIcon({ mode: 'custom', path: defaultPath }),
    icons.saveContextMenuOption('desktop', false),
    icons.saveContextMenuOption('tags', false),
  ]);
  assert.deepEqual(icons.data, { desktop: false, startMenu: true, tags: false, defaultIcon: defaultPath },
    'Concurrent icon and toggle saves preserve every preference');
  const iconsReloaded = createPlugin(); iconsReloaded.data = icons.data; await iconsReloaded.onload();
  assert.equal(iconsReloaded.defaultIcon, defaultPath, 'Default icon survives reload');
  await icons.createShortcut();
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Test vault', iconPath: defaultPath });
  await icons.createShortcut(undefined, 'start-menu', undefined, { mode: 'custom', path: overridePath });
  assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', iconPath: overridePath });
  await icons.createShortcut(undefined, 'desktop', undefined, { mode: 'standard' });
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Test vault' }, 'Standard icon overrides a custom default');
  await icons.createShortcut(undefined, 'desktop', 'Other vault');
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Other vault' }, 'Other vaults do not inherit this vault icon');
  await icons.createShortcut(undefined, 'desktop', 'Other vault', { mode: 'custom', path: overridePath });
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Other vault', iconPath: overridePath });
  assert.equal(await icons.createShortcut(undefined, 'desktop', undefined, { mode: 'custom', path: 'C:\\missing.ico' }), false);
  assert.equal(creations.length, 0, 'Unavailable icons must not silently produce a different shortcut');
  assert.match(notices.pop() ?? '', /unavailable on this computer/);
  icons.app.vault.files.set(b.path, b);
  icons.app.workspace.active.file = a;
  const optionsMenu = new Menu(); icons.app.workspace.fileHandler?.(optionsMenu, b);
  await optionsMenu.items.find(item => item.title.startsWith('Create shortcut with options'))?.callback?.();
  const optionsIcon = iconControls.at(-1);
  assert.ok(optionsIcon);
  assert.deepEqual(optionsIcon.initial, { mode: 'default' });
  assert.equal(optionsIcon.defaultPath, defaultPath);
  await optionsIcon.change({ mode: 'custom', path: overridePath });
  await optionsIcon.change({ mode: 'default' });
  const optionsCreate = Setting.buttons.find(button => button.text === 'Create shortcut');
  assert.ok(optionsCreate);
  optionsIcon.busy = true;
  await optionsCreate.click();
  assert.equal(creations.length, 0, 'Options cannot create while an image is being imported');
  optionsIcon.busy = false;
  await optionsCreate.click();
  assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', path: b.path, iconPath: defaultPath },
    'Options retain the clicked file and initial destination; reset restores the vault default');
  await Promise.all([
    icons.saveContextMenuOption('tags', true),
    icons.saveDefaultIcon({ mode: 'standard' }),
  ]);
  assert.deepEqual(icons.data, { desktop: false, startMenu: true, tags: true }, 'Reset preserves concurrently changed toggles');
  Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = []; Modal.opened = [];
  const tagged = createPlugin(); await tagged.onload();
  await tagged.saveDefaultIcon({ mode: 'custom', path: defaultPath });
  tagged.app.vault.files.set(b.path, b);
  tagged.app.workspace.active.file = a;
  tagged.app.metadataCache.entries.set(a, { tags: [{ tag: '#active-only' }] });
  tagged.app.metadataCache.entries.set(b, {
    tags: [{ tag: '#work' }, { tag: '#WORK' }, { tag: '#projects/client' }],
    frontmatter: { tags: ['todo', 'work'] },
  });
  await tagged.saveContextMenuOption('desktop', false);
  await tagged.saveContextMenuOption('startMenu', false);
  const tagMenu = new Menu();
  tagged.app.workspace.fileHandler?.(tagMenu, b);
  tagged.app.workspace.fileHandler?.(tagMenu, b);
  assert.deepEqual(tagMenu.items.map(item => item.title), ['Create tag shortcut']);
  await tagMenu.items[0].callback?.();
  assert.equal(Modal.opened.length, 1, 'There is one modal for the tag action');
  const modal = Modal.opened[0];
  assert.deepEqual(iconControls.at(-1)?.initial, { mode: 'default' }, 'Tags start with the vault default');
  assert.equal(Setting.dropdowns.length, 1, 'Windows destination is inside the modal');
  assert.equal(Setting.dropdowns[0].value, 'desktop');
  assert.equal(Setting.buttons[0].disabled, true);
  const tagList = modal.contentEl.messages[1];
  assert.deepEqual(tagList.options, ['', '#projects/client', '#todo', '#work'], 'A placeholder precedes sorted and case-insensitively deduplicated tags');
  assert.equal(tagList.selectedIndex, 0, 'The listbox has a stable selected row before the first click');
  tagList.value = '';
  tagList.onchange();
  assert.equal(Setting.buttons[0].disabled, true, 'The placeholder cannot create a shortcut');
  assert.equal(Setting.inputs.length, 0, 'Tag selection uses a list instead of a search field');
  tagList.value = '#active-only';
  tagList.onchange();
  assert.equal(Setting.buttons[0].disabled, true, 'Only the clicked note tags are accepted');
  tagList.value = '#projects/client';
  tagList.onchange();
  assert.equal(Setting.buttons[0].disabled, false);
  const tagIcon = iconControls.at(-1);
  assert.ok(tagIcon);
  tagIcon.busy = true;
  await Setting.buttons[0].click();
  assert.equal(creations.length, 0, 'Tags cannot create while an image is being imported');
  tagIcon.busy = false;
  Setting.dropdowns[0].change('start-menu');
  await Setting.buttons[0].click();
  assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', path: '#projects/client', iconPath: defaultPath });
  assert.equal(modal.contentEl.messages.length, 0, 'Successful creation closes the modal');
  await tagged.saveContextMenuOption('tags', false);
  const hidden = new Menu(); tagged.app.workspace.fileHandler?.(hidden, b);
  assert.equal(hidden.items.length, 0);
  const restored = createPlugin(); restored.data = tagged.data; await restored.onload();
  restored.app.vault.files.set(b.path, b);
  restored.app.metadataCache.entries.set(b, { tags: [{ tag: '#work' }] });
  const restoredTags = new Menu(); restored.app.workspace.fileHandler?.(restoredTags, b);
  assert.equal(restoredTags.items.length, 0, 'Tag toggle survives reload');
  await tagged.saveContextMenuOption('tags', true);
  tagged.app.vault.files.delete(b.path);
  await tagMenu.items[0].callback?.();
  assert.equal(Modal.opened.length, 1, 'Deleted notes cannot open a tag picker');
  Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = []; Modal.opened = [];
  for (const os of ['mac', 'linux', 'unsupported']) {
    Platform.isWin = false; Platform.isMacOS = os === 'mac'; Platform.isLinux = os === 'linux';
    const next = createPlugin(); await next.onload(); next.app.vault.files.set(a.path, a);
    const nextMenu = new Menu(); next.app.workspace.fileHandler?.(nextMenu, a);
    assert.equal(nextMenu.items.length, 1, 'Start menu action is Windows-only');
    await nextMenu.items[0].callback?.();
    if (os === 'unsupported') {
      assert.equal(creations.length, 0); assert.match(notices.pop() ?? '', /unavailable/);
    } else assert.deepEqual(creations.pop(), { os, vault: 'Test vault', path: a.path });
    if (os !== 'unsupported') {
      next.app.metadataCache.entries.set(a, { tags: [{ tag: '#work' }] });
      const tagsOnOS = new Menu(); next.app.workspace.fileHandler?.(tagsOnOS, a);
      assert.deepEqual(tagsOnOS.items.map(item => item.title), ['Create desktop shortcut', 'Create tag shortcut']);
      await tagsOnOS.items[1].callback?.();
      assert.equal(Setting.dropdowns.length, 0, 'Destination control is Windows-only');
      const osTagList = Modal.opened[0].contentEl.messages[1];
      osTagList.value = '#work';
      osTagList.onchange();
      await Setting.buttons[0].click();
      assert.deepEqual(creations.pop(), { os, vault: 'Test vault', path: '#work' });
      Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = []; Modal.opened = [];
    }
  }
  Platform.isWin = true; Platform.isMacOS = false; Platform.isLinux = false;
}
