import assert from 'node:assert/strict';

export const Platform = { isDesktopApp: true, isWin: true, isMacOS: false, isLinux: false };
const notices: string[] = [];
const creations: { os: string; vault: string; path?: string }[] = [];
export class Notice {
  constructor(message: string) { notices.push(message); }
}
export class TFile {
  constructor(public path: string, public extension = 'md') {}
}
export class MarkdownView { file: TFile | null = null; }
class MenuItem {
  callback: (() => Promise<void>) | undefined;
  setTitle(): this { return this; }
  setIcon(): this { return this; }
  onClick(callback: () => Promise<void>): this { this.callback = callback; return this; }
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
export { Modal, Setting } from './modal-fixture';
class Creator {
  constructor(private readonly os: string) {}
  createVaultShortcut(vault: string): Promise<string> {
    creations.push({ os: this.os, vault }); return Promise.resolve('Desktop/shortcut');
  }
  createNoteShortcut(vault: string, path: string): Promise<string> {
    creations.push({ os: this.os, vault, path }); return Promise.resolve('Desktop/shortcut');
  }
}
export class WindowsShortcutCreator extends Creator {
  constructor(destination = 'desktop') { super(destination === 'start-menu' ? 'windows-start-menu' : 'windows'); }
}
export class MacOSShortcutCreator extends Creator { constructor() { super('mac'); } }
export class LinuxShortcutCreator extends Creator { constructor() { super('linux'); } }

export async function runScenarios(createPlugin: () => Plugin & { saveContextMenuOption(key: 'desktop' | 'startMenu', enabled: boolean): Promise<void> }): Promise<void> {
  const plugin = createPlugin(); await plugin.onload();
  const a = new TFile('A.md'); const b = new TFile('Folder/B.md');
  plugin.app.vault.files.set(a.path, a); plugin.app.vault.files.set(b.path, b);
  plugin.app.workspace.active.file = a;
  const menu = new Menu();
  plugin.app.workspace.fileHandler?.(menu, b);
  plugin.app.workspace.fileHandler?.(menu, b);
  assert.equal(plugin.app.workspace.editorHandler, undefined, "Editor menus must not be registered");
  assert.equal(menu.items.length, 2, 'Duplicate events must add each destination only once');
  await menu.items[0].callback?.();
  assert.deepEqual(creations.pop(), { os: 'windows', vault: 'Test vault', path: b.path });
  await menu.items[1].callback?.();
  assert.deepEqual(creations.pop(), { os: 'windows-start-menu', vault: 'Test vault', path: b.path });
  for (const extension of ['jpg', 'csv', 'pdf', 'png']) {
    const attachment = new TFile('Attachments/File & name.' + extension, extension);
    plugin.app.vault.files.set(attachment.path, attachment);
    const attachmentMenu = new Menu();
    plugin.app.workspace.fileHandler?.(attachmentMenu, attachment);
    assert.equal(attachmentMenu.items.length, 2);
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
      assert.deepEqual(configured.data, { desktop, startMenu }, 'Both independent preferences must persist');
      const fileMenu = new Menu();
      const editorMenu = new Menu();
      configured.app.workspace.fileHandler?.(fileMenu, a);
      configured.app.workspace.editorHandler?.(editorMenu, undefined, { file: a });
      assert.equal(fileMenu.items.length, Number(desktop) + Number(startMenu));
      assert.equal(editorMenu.items.length, 0, 'Editor menus must stay unchanged for every toggle combination');
      const reloaded = createPlugin(); reloaded.data = configured.data;
      await reloaded.onload();
      const restoredMenu = new Menu(); reloaded.app.workspace.fileHandler?.(restoredMenu, a);
      assert.equal(restoredMenu.items.length, fileMenu.items.length, 'Preferences survive reload');
    }
  }
  for (const os of ['mac', 'linux', 'unsupported']) {
    Platform.isWin = false; Platform.isMacOS = os === 'mac'; Platform.isLinux = os === 'linux';
    const next = createPlugin(); await next.onload(); next.app.vault.files.set(a.path, a);
    const nextMenu = new Menu(); next.app.workspace.fileHandler?.(nextMenu, a);
    assert.equal(nextMenu.items.length, 1, 'Start menu action is Windows-only');
    await nextMenu.items[0].callback?.();
    if (os === 'unsupported') {
      assert.equal(creations.length, 0); assert.match(notices.pop() ?? '', /unavailable/);
    } else assert.deepEqual(creations.pop(), { os, vault: 'Test vault', path: a.path });
  }
}
