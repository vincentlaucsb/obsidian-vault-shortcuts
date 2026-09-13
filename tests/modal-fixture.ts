import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
export { discoveryErrorMessage } from '../src/vaultDiscovery';

let discoveryCalls = 0;
let discoveryFails = false;
export async function discoverVaults(): Promise<string[]> {
  discoveryCalls++;
  if (discoveryFails) throw new Error('CLI unavailable');
  return Promise.resolve(['Truck', 'Other & café']);
}

class TextElement {
  text = '';
  value = '';
  disabled = false;
  selectedIndex = -1;
  onchange: () => void = () => {};
  options: string[] = [];
  createEl(_tag: string, options: { value: string; text: string }): void { this.options.push(options.value); }
  setText(text: string): void { this.text = text; }
}
class Content {
  messages: TextElement[] = [];
  createEl(_tag: string, options: { text?: string }): TextElement {
    const element = new TextElement(); element.text = options.text ?? '';
    this.messages.push(element); return element;
  }
  empty(): void { this.messages = []; }
}
export class Modal {
  contentEl = new Content();
  setTitle(): void {}
  onOpen(): void {}
  onClose(): void {}
}
class Button {
  text = '';
  disabled = false;
  click: () => Promise<void> = () => Promise.resolve();
  setButtonText(text: string): this { this.text = text; return this; }
  setDisabled(disabled: boolean): this { this.disabled = disabled; return this; }
  setCta(): this { return this; }
  onClick(callback: () => Promise<void>): this { this.click = callback; return this; }
}
class Input {
  change: (value: string) => void = () => {};
  onChange(callback: (value: string) => void): this { this.change = callback; return this; }
  setValue(): this { return this; }
}
class Dropdown extends Input {
  addOption(): this { return this; }
}
export class Setting {
  static buttons: Button[] = [];
  static inputs: Input[] = [];
  static dropdowns: Dropdown[] = [];
  setName(): this { return this; }
  setDesc(): this { return this; }
  clear(): this { return this; }
  addButton(callback: (button: Button) => void): this {
    const button = new Button(); Setting.buttons.push(button); callback(button); return this;
  }
  addText(callback: (input: Input) => void): this {
    const input = new Input(); Setting.inputs.push(input); callback(input); return this;
  }
  addDropdown(callback: (dropdown: Dropdown) => void): this {
    const dropdown = new Dropdown(); Setting.dropdowns.push(dropdown); callback(dropdown); return this;
  }
}

export async function runModalScenarios(createModal: (create: (name: string, target: string) => Promise<void>) => Modal): Promise<void> {
  const created: string[][] = [];
  const modal = createModal((name, target) => { created.push([name, target]); return Promise.resolve(); });
  modal.onOpen();
  assert.equal(discoveryCalls, 1, 'Opening the modal must start discovery automatically');
  const create = Setting.buttons.find(button => button.text === 'Create shortcut');
  assert.ok(create);
  assert.equal(create.disabled, true);
  await create.click();
  assert.equal(created.length, 0, 'Blank input must not create a shortcut');
  await setImmediate();
  const list = modal.contentEl.messages[1];
  assert.deepEqual(list.options, ['Truck', 'Other & café']);
  list.value = 'Other & café';
  list.onchange();
  assert.equal(create.disabled, false);
  await create.click();
  assert.deepEqual(created, [['Other & café', 'desktop']]);
  modal.onClose();
  Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = [];
  discoveryFails = true;
  const fallback = createModal((name, target) => { created.push([name, target]); return Promise.resolve(); });
  fallback.onOpen();
  await setImmediate();
  assert.match(fallback.contentEl.messages[0].text, /register the CLI on PATH/);
  Setting.inputs[0].change('Other & café');
  const manualCreate = Setting.buttons[0];
  await manualCreate.click();
  assert.equal(created.length, 2, 'Manual creation remains available after discovery fails');
  assert.equal(manualCreate.disabled, false);
  fallback.onClose();
  const closed = createModal(() => Promise.resolve());
  closed.onOpen(); closed.onClose();
  await setImmediate();
  assert.equal(closed.contentEl.messages.length, 0, 'Late discovery must not update a closed modal');
}
