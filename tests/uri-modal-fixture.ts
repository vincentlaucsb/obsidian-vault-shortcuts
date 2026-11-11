import assert from 'node:assert/strict';
import type { IconSelection } from '../src/IconControl';

export const Platform = { isWin: true };
export const notices: string[] = [];
export const copied: string[] = [];
export let clipboardReads = 0;
export function discoverVaults(): Promise<string[]> { return Promise.resolve(['Recipes', 'Other vault']); }
export function discoveryErrorMessage(): string { return 'CLI unavailable'; }
const clipboard = {
  writeText: (value: string): Promise<void> => { copied.push(value); return Promise.resolve(); },
  readText: (): Promise<string> => { clipboardReads++; throw new Error('The builder must never read the clipboard'); },
};
interface DocumentFixture { defaultView: { navigator: { clipboard: typeof clipboard } }; activeElement: Element | undefined }
const document: DocumentFixture = { defaultView: { navigator: { clipboard } }, activeElement: undefined };

export class Element {
  children: Element[] = [];
  textContent = '';
  value = '';
  hidden = false;
  readOnly = false;
  disabled = false;
  removed = false;
  open = false;
  checked = false;
  onchange: () => void = () => {};
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  readonly attributes = new Map<string, string>();
  readonly ownerDocument = document;
  readonly classList = { add: (): void => {}, remove: (): void => {} };
  constructor(readonly tag = 'div', readonly parent?: Element) {}
  get isConnected(): boolean { return !this.removed && (this.parent?.isConnected ?? true); }
  createEl(tag: string, options?: { text?: string; value?: string; attr?: Record<string, string> }): Element {
    const element = new Element(tag, this);
    element.textContent = options?.text ?? '';
    element.value = options?.value ?? '';
    for (const [key, value] of Object.entries(options?.attr ?? {})) element.setAttribute(key, value);
    this.children.push(element); return element;
  }
  createDiv(): Element { const element = new Element('div', this); this.children.push(element); return element; }
  createSpan(options?: { text?: string }): Element { const element = new Element('span', this); element.textContent = options?.text ?? ''; this.children.push(element); return element; }
  setText(value: string): void { this.textContent = value; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  addClass(): void {}
  removeClass(): void {}
  toggleClass(): void {}
  empty(): void { for (const child of this.children) child.removed = true; this.children = []; }
  remove(): void { this.removed = true; }
  focus(): void { document.activeElement = this; }
  setSelectionRange(start: number, end: number): void { this.selectionStart = start; this.selectionEnd = end; }
  querySelector(selector: string): Element | null {
    const key = /data-uri-field="([^"]+)"/.exec(selector)?.[1];
    return this.descendants().find(element => element.attributes.get('data-uri-field') === key) ?? null;
  }
  descendants(): Element[] { return this.children.flatMap(child => [child, ...child.descendants()]); }
}

export class Modal {
  readonly contentEl = new Element();
  readonly modalEl = new Element();
  closeCalls = 0;
  constructor(readonly app: unknown) {}
  setTitle(): void {}
  open(): void { this.onOpen(); }
  close(): void { this.closeCalls++; this.onClose(); }
  onOpen(): void {}
  onClose(): void {}
}
export class Notice { constructor(message: string) { notices.push(message); } }

export class Input {
  readonly inputEl: Element;
  constructor(parent?: Element) { this.inputEl = parent ? parent.createEl('input') : new Element('input'); }
  value = '';
  disabled = false;
  change: (value: string) => void | Promise<void> = () => {};
  setValue(value: string): this { this.value = value; this.inputEl.value = value; return this; }
  setDisabled(value: boolean): this { this.disabled = value; return this; }
  setPlaceholder(): this { return this; }
  onChange(callback: (value: string) => void | Promise<void>): this { this.change = callback; return this; }
}
export class Dropdown extends Input {
  readonly selectEl = new Element('select');
  readonly options = new Map<string, string>();
  addOption(value: string, label: string): this { this.options.set(value, label); return this; }
  addOptions(options: Record<string, string>): this { for (const [key, value] of Object.entries(options)) this.addOption(key, value); return this; }
}
export class Toggle {
  readonly toggleEl = new Element();
  value = false;
  disabled = false;
  change: (value: boolean) => void | Promise<void> = () => {};
  setValue(value: boolean): this { this.value = value; return this; }
  setDisabled(value: boolean): this { this.disabled = value; return this; }
  onChange(callback: (value: boolean) => void | Promise<void>): this { this.change = callback; return this; }
}
export class Button {
  text = '';
  disabled = false;
  click: () => void | Promise<void> = () => {};
  readonly buttonEl = new Element('button');
  setButtonText(text: string): this { this.text = text; return this; }
  setDisabled(value: boolean): this { this.disabled = value; return this; }
  setCta(): this { return this; }
  setTooltip(): this { return this; }
  onClick(callback: () => void | Promise<void>): this { this.click = callback; return this; }
}
export class Setting {
  static readonly all: Setting[] = [];
  name = '';
  desc = '';
  readonly settingEl: Element;
  readonly controlEl: Element;
  readonly inputs: Input[] = [];
  readonly dropdowns: Dropdown[] = [];
  readonly buttons: Button[] = [];
  readonly toggles: Toggle[] = [];
  constructor(container: Element) {
    this.settingEl = container.createDiv(); this.controlEl = this.settingEl.createDiv(); Setting.all.push(this);
  }
  setName(name: string): this { this.name = name; return this; }
  setClass(): this { return this; }
  setDesc(desc: string): this { this.desc = desc; return this; }
  setDisabled(value: boolean): this {
    for (const component of [...this.inputs, ...this.dropdowns, ...this.buttons, ...this.toggles]) component.setDisabled(value);
    return this;
  }
  addText(callback: (input: Input) => void): this { const input = new Input(this.controlEl); this.inputs.push(input); callback(input); return this; }
  addTextArea(callback: (input: Input) => void): this { return this.addText(callback); }
  addDropdown(callback: (input: Dropdown) => void): this { const input = new Dropdown(); this.dropdowns.push(input); callback(input); return this; }
  addToggle(callback: (input: Toggle) => void): this { const input = new Toggle(); this.toggles.push(input); callback(input); return this; }
  addButton(callback: (input: Button) => void): this { const input = new Button(); this.buttons.push(input); callback(input); return this; }
}

export interface IconBoundary { container: Element; initial: IconSelection; defaultPath?: string; busy: boolean; select: (value: IconSelection) => Promise<void> }
export const icons: IconBoundary[] = [];
export function addIconControl(_container: unknown, initial: IconSelection,
  changed: (selection: IconSelection) => Promise<void>, defaultPath?: string): () => boolean {
  if (!(_container instanceof Element)) throw new Error('Expected owning icon container');
  const boundary = { container: _container, initial, defaultPath, busy: false, select: changed }; icons.push(boundary); return () => boundary.busy;
}

export function field(key: string): Setting {
  const setting = [...Setting.all].reverse().find(item => item.settingEl.isConnected &&
    [item.settingEl, ...item.inputs.map(input => input.inputEl), ...item.dropdowns.map(input => input.selectEl), ...item.toggles.map(toggle => toggle.toggleEl)]
      .some(element => element.attributes.get('data-uri-field') === key));
  assert.ok(setting, `Expected visible field ${key}`); return setting;
}
export function button(text: string): Button {
  const result = Setting.all.filter(item => item.settingEl.isConnected).flatMap(item => item.buttons).find(item => item.text === text);
  assert.ok(result, `Expected visible button ${text}`); return result;
}
