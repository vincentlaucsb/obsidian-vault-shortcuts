import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import type { IconSelection } from '../src/IconControl';

const elements: ElementFixture[] = [];
const notices: string[] = [];
const framesDrawn: number[][] = [];
let imports = 0;
export const Platform = { isWin: true, isMacOS: false, isLinux: false };
interface SelectedFile { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }

class ElementFixture {
  readonly ownerDocument = 'popout document';
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
    assert.equal(this.ownerDocument, 'popout document');
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
  click: () => void = () => {};
  setButtonText(text: string): this { this.text = text; return this; }
  setDisabled(disabled: boolean): this { this.disabled = disabled; return this; }
  onClick(callback: () => void): this { this.click = callback; return this; }
}

export class Setting {
  static buttons: Button[] = [];
  readonly controlEl: ElementFixture;
  constructor(container: ElementFixture) { this.controlEl = container.createDiv(); }
  setName(): this { return this; }
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
    choose.click();
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
    choose.click();
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
    choose.click();
    assert.match(notices.pop() ?? '', /Could not open image picker: Picker failed/);

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
      select.click(); picker.onchange();
      await setImmediate();
      assert.deepEqual(framesDrawn, [[PNG_ICON_SIZE, 0, PNG_ICON_SIZE / 4, PNG_ICON_SIZE, PNG_ICON_SIZE / 2]]);
      assert.deepEqual(selections, [{ mode: 'custom', path: platform === 'macos' ? '/Users/test/Icons/chosen.png' : '/home/test/Icons/chosen.png' }]);
      assert.equal(importing(), false);
    }
}
