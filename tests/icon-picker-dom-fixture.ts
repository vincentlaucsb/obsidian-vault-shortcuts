import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import type { IconSelection } from '../src/IconControl';

const elements: ElementFixture[] = [];
const notices: string[] = [];
const framesDrawn: number[][] = [];
let imports = 0;
export const Platform = { isWin: true, isMacOS: false, isLinux: false };
interface SelectedFile { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
interface ImageItem { types: readonly string[]; getType: (type: string) => Promise<Blob> }
let clipboardReads = 0;
let clipboardResult: () => Promise<ImageItem[]> = () => Promise.resolve([]);
const readClipboard = (): Promise<ImageItem[]> => { clipboardReads++; return clipboardResult(); };
const clipboard: { read?: () => Promise<ImageItem[]> } = { read: readClipboard };
const popoutDocument = { defaultView: { navigator: { clipboard } } };

class ElementFixture {
  readonly ownerDocument = popoutDocument;
  hidden = false;
  value = '';
  type = '';
  src = '';
  text = '';
  width = 0;
  height = 0;
  naturalWidth = 200;
  naturalHeight = 100;
  removed = false;
  clicks = 0;
  failClick = false;
  files: SelectedFile[] | undefined;
  onchange: () => void = () => {};
  constructor(readonly tag: string, readonly parent?: ElementFixture) { elements.push(this); }
  get isConnected(): boolean { return !this.removed && (this.parent?.isConnected ?? true); }
  createEl(tag: string, options?: { type?: string }): ElementFixture {
    const element = new ElementFixture(tag, this);
    element.type = options?.type ?? '';
    return element;
  }
  createDiv(): ElementFixture { return new ElementFixture('div', this); }
  setText(text: string): void { this.text = text; }
  remove(): void { this.removed = true; }
  click(): void {
    assert.equal(this.ownerDocument, popoutDocument);
    assert.equal(this.isConnected, true, 'file picker must be attached to the receiving window');
    assert.equal(this.type, 'file');
    assert.equal(this.value, '', 'reset allows selecting the same image again');
    if (this.failClick) throw new Error('Picker failed');
    this.clicks++;
  }
  decode(): Promise<void> {
    assert.equal(this.isConnected, true, 'decode uses the popout workspace');
    return Promise.resolve();
  }
  getContext(): { drawImage: (_image: ElementFixture, x: number, y: number, width: number, height: number) => void } {
    assert.equal(this.isConnected, true);
    return { drawImage: (_image, x, y, width, height) => { framesDrawn.push([this.width, x, y, width, height]); } };
  }
  toDataURL(): string { return 'data:image/png;base64,cG5n'; }
}

class Button {
  text = '';
  disabled = false;
  click: () => void | Promise<void> = () => {};
  setButtonText(text: string): this { this.text = text; return this; }
  setDisabled(disabled: boolean): this { this.disabled = disabled; return this; }
  onClick(callback: () => void | Promise<void>): this { this.click = callback; return this; }
}

export class Setting {
  static buttons: Button[] = [];
  readonly controlEl: ElementFixture;
  constructor(container: ElementFixture) { this.controlEl = container.createDiv(); }
  setName(): this { return this; }
  setClass(): this { return this; }
  addButton(callback: (button: Button) => void): this {
    const button = new Button(); Setting.buttons.push(button); callback(button); return this;
  }
}
export class Notice { constructor(message: string) { notices.push(message); } }

// Conversion/storage boundaries are deterministic here; the real control, file
// input handling, decode/resize orchestration, callbacks and cleanup are exercised.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const ICON_SIZES = [16, 32, 48, 256];
export const PNG_ICON_SIZE = 512;
export function validateIconPath(): void {}
export function validatePosixIconPath(): void {}
export function validatePngIcon(): void {}
export function validateIco(): void {}
export function createIco(frames: readonly { size: number; png: Uint8Array }[]): Buffer {
  assert.deepEqual(frames.map(frame => frame.size), ICON_SIZES);
  return Buffer.from('ico');
}
export function storeIcon(): Promise<string> { imports++; return Promise.resolve('C:\\Icons\\chosen.ico'); }
export function storePngIcon(_data: Uint8Array, platform: 'macos' | 'linux'): Promise<string> {
  imports++;
  return Promise.resolve(platform === 'macos' ? '/Users/test/Icons/chosen.png' : '/home/test/Icons/chosen.png');
}
export function stat(): Promise<{ size: number }> { return Promise.resolve({ size: 3 }); }
export function readFile(): Promise<Buffer> { return Promise.resolve(Buffer.from('ico')); }

type ControlFactory = (container: ElementFixture, initial: IconSelection,
  change: (selection: IconSelection) => Promise<void>) => () => boolean;

export async function runPickerScenarios(addControl: ControlFactory): Promise<void> {
  // Node intentionally has no global createEl. Any use of the main-window
  // helper fails; all elements must be created through this connected root.
    const root = new ElementFixture('root');
    const changes: IconSelection[] = [];
    const busy = addControl(root, { mode: 'standard' }, value => { changes.push(value); return Promise.resolve(); });
    const choose = Setting.buttons.find(button => button.text === 'Choose image…');
    assert.ok(choose);
    const input = elements.find(element => element.tag === 'input');
    assert.ok(input);
    await choose.click();
    assert.equal(input.clicks, 1);
    input.onchange();
    await setImmediate();
    assert.equal(changes.length, 0, 'cancelling leaves selection unchanged');
    assert.equal(busy(), false);

    input.files = [{ name: 'bad.txt', size: 1, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }];
    input.onchange();
    await setImmediate();
    assert.equal(changes.length, 0, 'failed import leaves selection unchanged');
    assert.match(notices.pop() ?? '', /Choose a PNG, JPEG or ICO/);

    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 200); view.setUint32(20, 100);
    input.files = [{ name: 'recipe.png', size: 24, arrayBuffer: () => Promise.resolve(bytes.buffer) }];
    input.value = 'previous image';
    await choose.click();
    assert.equal(input.clicks, 2, 'one persistent owner-window input is reused');
    input.onchange();
    assert.equal(busy(), true);
    await setImmediate();
    assert.equal(imports, 1);
    assert.deepEqual(changes, [{ mode: 'custom', path: 'C:\\Icons\\chosen.ico' }]);
    assert.deepEqual(framesDrawn, ICON_SIZES.map(size => [size, 0, size / 4, size, size / 2]), 'rectangles fit without distortion');
    assert.equal(busy(), false);
    assert.equal(elements.find(element => element.tag === 'canvas')?.isConnected, false, 'conversion workspace is removed');

    input.failClick = true;
    await choose.click();
    assert.match(notices.pop() ?? '', /Could not open image picker: Picker failed/);

    const paste = Setting.buttons.find(button => button.text === 'Paste image');
    assert.ok(paste);
    assert.equal(clipboardReads, 0, 'Opening, previewing and choosing a file never read the clipboard');
    await paste.click();
    assert.match(notices.pop() ?? '', /no supported image/);
    assert.equal(changes.length, 1, 'An empty clipboard preserves the current icon');
    clipboardResult = () => Promise.resolve([{ types: ['text/plain', 'text/html'], getType: () => {
      throw new Error('Text/HTML must not be read as an image');
    } }]);
    await paste.click();
    assert.match(notices.pop() ?? '', /no supported image/);
    assert.equal(changes.length, 1);
    clipboardResult = () => Promise.reject(new Error('Permission denied'));
    await paste.click();
    assert.match(notices.pop() ?? '', /denied or unavailable/);
    assert.equal(changes.length, 1);
    clipboard.read = undefined;
    await paste.click();
    assert.match(notices.pop() ?? '', /unavailable in this window/);
    clipboard.read = readClipboard;

    let finishRead: (items: ImageItem[]) => void = () => {};
    clipboardResult = () => new Promise(resolve => { finishRead = resolve; });
    const beforePasteReads = clipboardReads;
    const pendingPaste = paste.click();
    assert.equal(clipboardReads, beforePasteReads + 1, 'The owning window reads synchronously within the user gesture');
    assert.equal(busy(), true);
    assert.equal(choose.disabled, true);
    assert.equal(paste.disabled, true);
    await paste.click();
    assert.equal(clipboardReads, beforePasteReads + 1, 'Repeated paste clicks cannot start overlapping reads');
    const beforeConcurrentImport = imports;
    input.onchange();
    assert.equal(imports, beforeConcurrentImport, 'A file input result cannot overlap a pending clipboard import');
    const imageItem: ImageItem = { types: ['text/html', 'image/png'], getType: type => {
      assert.equal(type, 'image/png'); return Promise.resolve(new Blob([bytes], { type }));
    } };
    finishRead([imageItem]);
    await pendingPaste;
    assert.equal(changes.length, 2);
    assert.equal(busy(), false);
    assert.equal(paste.disabled, false);
    const frozenSelection = changes.at(-1);
    clipboardResult = () => Promise.resolve([]);
    await paste.click();
    assert.deepEqual(changes.at(-1), frozenSelection, 'Clipboard changes never alter an imported icon');
    assert.match(notices.pop() ?? '', /no supported image/);

    clipboardResult = () => Promise.resolve([{ types: ['image/png'], getType: () => Promise.resolve(new Blob([Buffer.alloc(MAX_IMAGE_BYTES + 1)])) }]);
    await paste.click();
    assert.match(notices.pop() ?? '', /smaller than 20 MB/);
    assert.equal(changes.length, 2, 'Oversized clipboard images preserve the selection');
    clipboardResult = () => Promise.resolve([{ types: ['image/png'], getType: () => Promise.resolve(new Blob(['not an image'])) }]);
    await paste.click();
    assert.match(notices.pop() ?? '', /not a valid PNG or JPEG/);
    assert.equal(changes.length, 2, 'An image MIME label cannot bypass validation');

    for (const platform of ['macos', 'linux'] as const) {
      Platform.isWin = false; Platform.isMacOS = platform === 'macos'; Platform.isLinux = platform === 'linux';
      framesDrawn.length = 0;
      const buttonStart = Setting.buttons.length;
      const localRoot = new ElementFixture('root');
      const selections: IconSelection[] = [];
      const importing = addControl(localRoot, { mode: 'standard' }, value => { selections.push(value); return Promise.resolve(); });
      const select = Setting.buttons.slice(buttonStart).find(button => button.text === 'Choose image…');
      const picker = elements.filter(element => element.tag === 'input').at(-1);
      assert.ok(select); assert.ok(picker);
      picker.files = [{ name: 'recipe.png', size: 24, arrayBuffer: () => Promise.resolve(bytes.buffer) }];
      await select.click(); picker.onchange();
      await setImmediate();
      assert.deepEqual(framesDrawn, [[PNG_ICON_SIZE, 0, PNG_ICON_SIZE / 4, PNG_ICON_SIZE, PNG_ICON_SIZE / 2]]);
      assert.deepEqual(selections, [{ mode: 'custom', path: platform === 'macos' ? '/Users/test/Icons/chosen.png' : '/home/test/Icons/chosen.png' }]);
      assert.equal(importing(), false);
      const localPaste = Setting.buttons.slice(buttonStart).find(button => button.text === 'Paste image');
      assert.ok(localPaste);
      clipboardResult = () => Promise.resolve([imageItem]);
      await localPaste.click();
      assert.equal(selections.length, 2, 'Paste uses the same native image pipeline on each OS');
      clipboardResult = () => new Promise(resolve => { finishRead = resolve; });
      const closingPaste = localPaste.click();
      localRoot.remove();
      finishRead([imageItem]);
      await closingPaste;
      assert.equal(selections.length, 2, 'A clipboard read finishing after close cannot change the icon');
      assert.equal(importing(), false);
    }
}
