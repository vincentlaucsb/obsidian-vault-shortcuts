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
  createEl(_tag: string, options: { value: string; text: string }): TextElement {
    this.options.push(options.value);
    const element = new TextElement();
    element.value = options.value; element.text = options.text;
    return element;
  }
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
  static opened: Modal[] = [];
  constructor(readonly app: unknown = undefined) {}
  contentEl = new Content();
  open(): void { Modal.opened.push(this); this.onOpen(); }
  close(): void { this.onClose(); }
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
  inputEl = {};
  value = '';
  change: (value: string) => void = () => {};
  onChange(callback: (value: string) => void): this { this.change = callback; return this; }
  setValue(value: string): this { this.value = value; return this; }
  setPlaceholder(): this { return this; }
}
class Dropdown extends Input {
  addOption(): this { return this; }
}
export class Setting {
  static buttons: Button[] = [];
  static inputs: Input[] = [];
  static dropdowns: Dropdown[] = [];
  constructor(_container: unknown = undefined) {}
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

export async function runTagModalScenarios(
  createModal: (create: (tag: string, target: string) => Promise<boolean>) => Modal,
): Promise<void> {
  Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = [];
  let calls = 0;
  let complete: (created: boolean) => void = () => {};
  const modal = createModal((tag, target) => {
    calls++;
    assert.equal(tag, '#work');
    assert.equal(target, 'desktop');
    return new Promise<boolean>(resolve => { complete = resolve; });
  });
  modal.onOpen();
  const button = Setting.buttons[0];
  await button.click();
  assert.equal(calls, 0, 'A tag must be selected before creation');
  const tagList = modal.contentEl.messages[1];
  tagList.value = '#work';
  tagList.onchange();
  const pending = button.click();
  assert.equal(button.disabled, true);
  await button.click();
  assert.equal(calls, 1, 'Repeated clicks during creation cannot create duplicate shortcuts');
  complete(false);
  await pending;
  assert.equal(button.disabled, false, 'Failed creation allows retry with the selected tag');
  const retry = button.click();
  assert.equal(calls, 2);
  modal.onClose();
  complete(true);
  await retry;
  await button.click();
  assert.equal(calls, 2, 'A closed modal cannot start another creation');
  assert.equal(button.disabled, true, 'Late results do not update the closed modal');
  Setting.buttons = []; Setting.inputs = []; Setting.dropdowns = [];
}
