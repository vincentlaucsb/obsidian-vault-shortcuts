import assert from 'node:assert/strict';
import type { IconSelection } from '../src/IconControl';
import type { ShortcutContext, ShortcutRequest } from '../src/shortcuts/requests';
import type { ShortcutDestination } from '../src/shortcuts/WindowsShortcutCreator';
import { button, clipboardReads, copied, field, icons, Modal, Platform, Setting } from './uri-modal-fixture';

interface Options {
  context: ShortcutContext;
  initialRequest?: ShortcutRequest;
  defaultIcon?: string;
  initialIcon?: IconSelection;
  target?: ShortcutDestination;
  create: (request: ShortcutRequest, label: string, target: ShortcutDestination, icon: IconSelection) => Promise<boolean>;
}
type Factory = (options: Options) => Modal;

function uri(modal: Modal): URL {
  const preview = modal.contentEl.descendants().find(element => element.attributes.get('aria-label') === 'URI preview');
  assert.ok(preview, 'A labeled live URI preview is visible');
  assert.ok(preview.readOnly || preview.attributes.has('readonly'), 'URI preview is read only');
  return new URL(preview.value);
}
async function text(key: string, value: string): Promise<void> {
  const setting = field(key);
  assert.ok(setting.settingEl.isVisible, `Text field ${key} is in the active tab`);
  setting.inputs[0].setValue(value);
  await setting.inputs[0].change(value);
}
async function select(key: string, value: string): Promise<void> {
  const setting = field(key);
  assert.ok(setting.settingEl.isVisible, `Select field ${key} is in the active tab`);
  await setting.dropdowns[0].change(value);
}
function absent(key: string): boolean {
  return !Setting.all.some(setting => setting.settingEl.isConnected &&
    [setting.settingEl, ...setting.inputs.map(input => input.inputEl), ...setting.dropdowns.map(input => input.selectEl)]
      .some(element => element.attributes.get('data-uri-field') === key));
}

export async function runUriModalScenarios(factory: Factory): Promise<void> {
  const creations: ShortcutRequest[] = [];
  const labels: string[] = [];
  const general = factory({ context: { kind: 'general', currentVault: 'Recipes' }, defaultIcon: 'C:\\Icons\\vault-default.ico',
    create: request => { creations.push(request); return Promise.resolve(false); } });
  general.open();
  assert.equal(copied.length, 0, 'Opening and previewing must not touch the clipboard');
  assert.equal(uri(general).searchParams.get('vault'), 'Recipes');
  const generalTab = button('General').buttonEl;
  const advancedTab = button('Advanced').buttonEl;
  const panels = general.contentEl.descendants().filter(element => element.attributes.get('role') === 'tabpanel');
  assert.equal(panels.length, 2);
  assert.equal(generalTab.attributes.get('role'), 'tab');
  assert.equal(generalTab.attributes.get('aria-selected'), 'true');
  assert.equal(generalTab.tabIndex, 0);
  assert.equal(advancedTab.tabIndex, -1);
  assert.equal(generalTab.attributes.get('aria-controls'), panels[0].id);
  assert.equal(panels[1].attributes.get('aria-labelledby'), advancedTab.id);
  assert.equal(field('label').settingEl.isVisible, true);
  assert.equal(field('action').settingEl.isVisible, false, 'URI controls start in the hidden Advanced panel');
  const preview = general.contentEl.descendants().find(element => element.attributes.get('aria-label') === 'URI preview');
  assert.ok(preview?.isVisible);
  const customRadio = general.contentEl.descendants().find(element => element.attributes.get('value') === 'custom');
  assert.ok(customRadio);
  customRadio.onchange();
  const generalIcon = icons[icons.length - 1];
  assert.equal(generalIcon.container.hidden, false);
  assert.deepEqual(generalIcon.initial, { mode: 'standard' }, 'Custom picker starts empty even when vault default exists');
  assert.equal(generalIcon.defaultPath, undefined, 'Vault default thumbnail is not passed to the custom picker');
  await generalIcon.select({ mode: 'standard' });
  assert.equal(generalIcon.container.hidden, true, 'Standard icon choice hides the custom picker');
  let prevented = false;
  generalTab.onkeydown({ key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(generalTab.ownerDocument.activeElement, advancedTab);
  assert.equal(advancedTab.attributes.get('aria-selected'), 'true');
  assert.equal(field('label').settingEl.isVisible, false);
  assert.equal(field('action').settingEl.isVisible, true);
  assert.equal(preview.isVisible, true, 'Preview stays outside the switching panels');
  await select('target-mode', 'file');
  await text('file', 'Meals/Soup.md');
  await select('navigation', 'heading');
  await text('anchor', 'Steps & tips');
  await select('pane', 'window');
  await button('Copy URI').click();
  assert.equal(copied.length, 1);
  assert.equal(new URL(copied[0]).searchParams.get('file'), 'Meals/Soup.md#Steps & tips');
  assert.equal(uri(general).searchParams.get('paneType'), 'window');
  const beforeSwitch = uri(general).href;
  advancedTab.onkeydown({ key: 'Home', preventDefault: () => {} });
  await text('label', 'My shortcut');
  assert.equal(field('action').settingEl.isVisible, false);
  assert.equal(preview.isVisible, true);
  assert.equal(button('Create shortcut').buttonEl.isVisible, true);
  await button('Copy URI').click();
  assert.equal(copied[1], beforeSwitch, 'Copy works from General after Advanced edits');
  generalTab.onkeydown({ key: 'ArrowLeft', preventDefault: () => {} });
  assert.equal(advancedTab.attributes.get('aria-selected'), 'true', 'Left wraps to Advanced');
  advancedTab.onkeydown({ key: 'ArrowRight', preventDefault: () => {} });
  assert.equal(generalTab.attributes.get('aria-selected'), 'true', 'Right wraps to General');
  generalTab.onkeydown({ key: 'End', preventDefault: () => {} });
  assert.equal(uri(general).href, beforeSwitch, 'Switching tabs retains the action draft');
  assert.equal(field('label').inputs[0].value, 'My shortcut');

  await select('action', 'append');
  await text('file', 'Meals/Log.md');
  await select('content-source', 'text');
  await text('text', 'This literal text must disappear');
  await text('heading', 'Log');
  await select('spacing', 'inline');
  await select('pane', 'tab');
  await select('content-source', 'clipboard');
  await field('silent').toggles[0].change(true);
  const append = uri(general);
  assert.equal(append.hostname, 'new');
  assert.equal(append.searchParams.get('append'), 'true');
  assert.equal(append.searchParams.get('clipboard'), 'true');
  assert.equal(append.searchParams.get('content'), null);
  assert.equal(append.searchParams.get('paneType'), null);
  assert.equal(append.searchParams.get('heading'), 'Log');
  assert.ok(absent('text'));
  assert.ok(absent('pane'));
  assert.equal(copied.length, 2, 'Clipboard content is deferred until launch');

  await select('action', 'replace');
  await text('file', 'Meals/Log.md');
  await select('content-source', 'clipboard');
  const replace = uri(general);
  assert.equal(replace.searchParams.get('overwrite'), 'true');
  for (const key of ['append', 'prepend', 'heading', 'spacing']) assert.equal(replace.searchParams.get(key), null);
  assert.ok(absent('heading'));
  await select('action', 'search');
  await text('query', 'tag:#recipes/雪');
  assert.equal(uri(general).hostname, 'search');
  assert.equal(uri(general).searchParams.get('query'), 'tag:#recipes/雪');
  for (const key of ['clipboard', 'overwrite', 'silent', 'file', 'paneType']) assert.equal(uri(general).searchParams.get(key), null);
  await select('action', 'choose-vault');
  assert.equal(uri(general).href, 'obsidian://choose-vault');
  assert.ok(absent('vault'));
  await select('action', 'append');
  assert.equal(uri(general).searchParams.get('heading'), 'Log', 'Action drafts are restored');
  assert.equal(uri(general).searchParams.get('clipboard'), 'true');
  await select('action', 'open');
  assert.equal(uri(general).searchParams.get('file'), 'Meals/Soup.md#Steps & tips');
  const focusedFile = field('file').inputs[0].inputEl;
  focusedFile.focus();
  focusedFile.value = 'Meals/Photo.jpg';
  focusedFile.setSelectionRange(focusedFile.value.length, focusedFile.value.length);
  await text('file', 'Meals/Photo.jpg');
  assert.equal(field('file').inputs[0].inputEl.ownerDocument.activeElement, field('file').inputs[0].inputEl, 'Extension changes preserve keyboard focus');
  assert.equal(field('file').inputs[0].inputEl.selectionStart, 'Meals/Photo.jpg'.length);
  assert.equal(uri(general).searchParams.get('file'), 'Meals/Photo.jpg', 'Attachment targets omit stale Markdown navigation');
  assert.ok(absent('navigation'));
  await text('file', 'Meals/Soup.md');
  await select('navigation', 'heading');
  await text('anchor', 'Steps & tips');
  await select('target-mode', 'path');
  await text('path', 'C:\\Notes\\Other.md');
  assert.ok(absent('vault'), 'An absolute file path replaces vault selection');
  assert.equal(uri(general).searchParams.get('path'), 'C:\\Notes\\Other.md#Steps & tips');
  assert.equal(uri(general).searchParams.get('vault'), null);
  assert.equal(uri(general).searchParams.get('file'), null);
  await select('action', 'new');
  assert.ok(field('vault').inputs[0].disabled || field('vault').inputs[0].inputEl.readOnly, 'New-note creation stays in current vault');
  await text('name', 'New recipe');
  assert.equal(uri(general).searchParams.get('name'), 'New recipe');
  assert.equal(uri(general).searchParams.get('vault'), 'Recipes');
  await select('action', 'daily');
  assert.equal(uri(general).hostname, 'daily');
  assert.ok(absent('file'));
  await select('daily-mode', 'append');
  await select('content-source', 'clipboard');
  await text('heading', 'Daily log');
  assert.equal(uri(general).searchParams.get('append'), 'true');
  await select('daily-mode', 'replace');
  assert.equal(uri(general).searchParams.get('overwrite'), 'true');
  assert.equal(uri(general).searchParams.get('heading'), null);
  assert.equal(uri(general).searchParams.get('spacing'), null);
  await field('silent').toggles[0].change(true);
  await select('daily-mode', 'open');
  for (const key of ['silent', 'clipboard', 'overwrite', 'heading', 'spacing']) assert.equal(uri(general).searchParams.get(key), null, `Normal Daily open omits ${key}`);
  await select('action', 'unique');
  await select('content-source', 'clipboard');
  assert.equal(uri(general).hostname, 'unique');
  assert.equal(uri(general).searchParams.get('clipboard'), 'true');
  for (const key of ['heading', 'spacing', 'overwrite', 'silent']) assert.equal(uri(general).searchParams.get(key), null);
  await select('action', 'hook-get-address');
  await text('x-success', 'sample-app://complete?name=Snow & soup');
  await text('x-error', 'sample-app://error');
  assert.equal(uri(general).searchParams.get('x-success'), 'sample-app://complete?name=Snow & soup');
  assert.equal(uri(general).searchParams.get('x-error'), 'sample-app://error');
  general.close();

  const bound = factory({ context: { kind: 'file', vault: 'Recipes', file: 'Meals/Clicked.md', markdown: true },
    create: (request, label) => { creations.push(request); labels.push(label); return Promise.resolve(false); } });
  bound.open();
  await button('Advanced').click();
  assert.deepEqual([...field('action').dropdowns[0].options.keys()], ['open', 'append', 'prepend', 'replace']);
  assert.ok(field('vault').inputs[0].disabled || field('vault').inputs[0].inputEl.readOnly);
  assert.ok(field('file').inputs[0].disabled || field('file').inputs[0].inputEl.readOnly);
  assert.ok(absent('target-mode'));
  await select('action', 'append');
  await button('General').click();
  await text('label', 'Custom shortcut filename');
  await button('Advanced').click();
  await select('content-source', 'clipboard');
  assert.equal(uri(bound).searchParams.get('file'), 'Meals/Clicked.md');
  await button('General').click();
  assert.equal(field('content-source').settingEl.isVisible, false);
  assert.ok(bound.contentEl.descendants().some(element => element.isVisible && element.textContent.includes('When launched')),
    'Launch effects remain visible with writing controls hidden');
  const icon = icons[icons.length - 1];
  assert.ok(icon);
  icon.busy = true;
  await button('Create shortcut').click();
  assert.equal(creations.length, 0, 'Creation waits for pending icon imports');
  icon.busy = false;
  await button('Create shortcut').click();
  assert.equal(creations.length, 1);
  assert.deepEqual(labels, ['Custom shortcut filename']);
  assert.equal(uri(bound).searchParams.get('file'), 'Meals/Clicked.md', 'Display filename never changes the URI target');
  bound.close();

  const attachment = factory({ context: { kind: 'file', vault: 'Recipes', file: 'Meal.jpg', markdown: false },
    create: () => Promise.resolve(true) });
  attachment.open();
  await button('Advanced').click();
  assert.deepEqual([...field('action').dropdowns[0].options.keys()], ['open']);
  assert.ok(absent('navigation'));
  assert.equal(uri(attachment).searchParams.get('file'), 'Meal.jpg');
  attachment.close();

  let finish: (value: boolean) => void = () => {};
  let pendingCalls = 0;
  const pending = factory({ context: { kind: 'general', currentVault: 'Recipes' }, create: () => {
    pendingCalls++; return new Promise<boolean>(resolve => { finish = resolve; });
  } });
  pending.open();
  const create = button('Create shortcut');
  const result = create.click();
  await create.click();
  assert.equal(pendingCalls, 1, 'Repeated clicks during creation cannot duplicate shortcuts');
  pending.close();
  finish(true);
  await result;
  assert.equal(pending.closeCalls, 1, 'Late completion does not close or mutate a closed modal again');
  await create.click();
  assert.equal(pendingCalls, 1);
  assert.equal(pending.contentEl.children.length, 0);

  const customPath = 'C:\\Icons\\explicit-custom.ico';
  const seededCustom = factory({ context: { kind: 'general', currentVault: 'Recipes' },
    defaultIcon: 'C:\\Icons\\vault-default.ico', initialIcon: { mode: 'custom', path: customPath },
    create: () => Promise.resolve(true) });
  seededCustom.open();
  const seededIcon = icons[icons.length - 1];
  assert.deepEqual(seededIcon.initial, { mode: 'custom', path: customPath }, 'An explicit custom image is preserved');
  assert.equal(seededIcon.defaultPath, undefined);
  assert.equal(seededIcon.container.hidden, false);
  seededCustom.close();

  Platform.isWin = false;
  const linux = factory({ context: { kind: 'general', currentVault: 'Recipes' }, create: () => Promise.resolve(true) });
  linux.open();
  assert.ok(absent('destination'), 'Start-menu destination control is Windows-only');
  linux.close();
  assert.equal(clipboardReads, 0, 'Clipboard source is serialized, never read during setup');
}
