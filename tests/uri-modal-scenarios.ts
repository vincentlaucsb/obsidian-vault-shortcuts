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
  verifyVaultId?: (value: string) => Promise<string>;
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
  assert.equal(field('vault').inputs[0].inputEl.readOnly, true, 'The notebook fixes its vault before opening the options dialog');
  assert.equal(general.contentEl.descendants().some(element => element.attributes.get('aria-label') === 'Known vaults'), false, 'Vault discovery belongs in the separate other-vault dialog');
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
  assert.equal(generalIcon.allowDefault, false);
  assert.equal(generalIcon.allowStandard, false, 'Icon mode is selected only by the outer radio group');
  const standardRadio = general.contentEl.descendants().find(element => element.attributes.get('value') === 'standard');
  assert.ok(standardRadio);
  standardRadio.onchange();
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
  assert.deepEqual([...field('target-mode').dropdowns[0].options.keys()], ['vault', 'file'], 'Absolute paths cannot bypass the notebook vault');
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
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard', 'Fresh append defaults to clipboard at launch');
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
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard', 'Fresh replace defaults to clipboard at launch');
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
  const fixedBeforeTampering = uri(general).href;
  await select('target-mode', 'path');
  assert.ok(absent('path'), 'An injected dropdown value cannot introduce absolute paths');
  assert.equal(uri(general).href, fixedBeforeTampering);
  await text('vault', 'Other vault');
  assert.equal(uri(general).searchParams.get('vault'), 'Recipes', 'Even a forged change event cannot replace the fixed vault');
  await select('action', 'new');
  assert.ok(field('vault').inputs[0].disabled || field('vault').inputs[0].inputEl.readOnly, 'New-note creation stays in current vault');
  await text('name', 'New recipe');
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard', 'Fresh new-note creation defaults to clipboard at launch');
  assert.equal(uri(general).searchParams.get('clipboard'), 'true');
  assert.equal(uri(general).searchParams.get('name'), 'New recipe');
  assert.equal(uri(general).searchParams.get('vault'), 'Recipes');
  await select('action', 'daily');
  assert.equal(uri(general).hostname, 'daily');
  assert.ok(absent('file'));
  assert.equal(uri(general).searchParams.get('clipboard'), null, 'Daily Open does not capture content');
  await select('daily-mode', 'append');
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard', 'Daily capture defaults to clipboard at launch');
  await select('content-source', 'text');
  await text('text', 'Preserve daily text');
  await select('daily-mode', 'open');
  assert.equal(uri(general).searchParams.has('content'), false);
  await select('daily-mode', 'append');
  assert.equal(field('content-source').dropdowns[0].value, 'text', 'Daily capture retains an explicit source after Open');
  assert.equal(uri(general).searchParams.get('content'), 'Preserve daily text');
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
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard', 'Fresh unique-note creation defaults to clipboard at launch');
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

  const selectedVault = 'Other & café';
  let selectedRequest: ShortcutRequest | undefined;
  let selectedIcon: IconSelection | undefined;
  const selected = factory({ context: { kind: 'general', currentVault: 'Recipes', targetVault: selectedVault },
    initialRequest: { action: 'open', target: { kind: 'vault', vault: selectedVault } },
    initialIcon: { mode: 'default' }, create: (request, _label, _destination, icon) => {
      selectedRequest = request; selectedIcon = icon; return Promise.resolve(false);
    } });
  selected.open();
  await button('Advanced').click();
  assert.equal(field('vault').inputs[0].inputEl.readOnly, true);
  assert.equal(uri(selected).searchParams.get('vault'), selectedVault);
  await text('vault', 'Recipes');
  assert.equal(uri(selected).searchParams.get('vault'), selectedVault, 'The other-vault selection stays fixed');
  await select('action', 'new');
  await text('name', 'Selected vault note');
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard');
  assert.equal(uri(selected).searchParams.get('vault'), selectedVault, 'New notes use the explicitly selected other vault');
  await select('content-source', 'text');
  await text('text', 'Keep this draft');
  await select('action', 'search');
  await select('action', 'new');
  assert.equal(field('content-source').dropdowns[0].value, 'text', 'Changing actions restores an explicit content choice');
  assert.equal(uri(selected).searchParams.get('content'), 'Keep this draft');
  await button('Create shortcut').click();
  assert.ok(selectedRequest && 'target' in selectedRequest && selectedRequest.target.kind === 'name');
  assert.equal(selectedRequest.target.vault, selectedVault);
  assert.deepEqual(selectedIcon, { mode: 'standard' }, 'Other-vault shortcuts do not inherit the current vault default');
  selected.close();

  const explicitEmpty = factory({ context: { kind: 'general', currentVault: 'Recipes' },
    initialRequest: { action: 'new', target: { kind: 'name', vault: 'Recipes', name: 'Empty note' }, mode: 'create', content: { kind: 'none' } },
    create: () => Promise.resolve(false) });
  explicitEmpty.open();
  await button('Advanced').click();
  assert.equal(field('content-source').dropdowns[0].value, 'none', 'An explicit empty-note preset remains empty');
  assert.equal(uri(explicitEmpty).searchParams.has('clipboard'), false);
  explicitEmpty.close();

  const vaultId = '1234567890abcdef';
  let verificationChecks = 0;
  const bound = factory({ context: { kind: 'file', vault: 'Recipes', file: 'Meals/Clicked.md', markdown: true },
    verifyVaultId: id => {
      verificationChecks++;
      return id === vaultId ? Promise.resolve(id) : Promise.reject(new Error('This ID belongs to a different vault.'));
    },
    create: (request, label) => { creations.push(request); labels.push(label); return Promise.resolve(false); } });
  bound.open();
  await button('Advanced').click();
  assert.deepEqual([...field('action').dropdowns[0].options.keys()], ['open', 'append', 'prepend', 'replace']);
  assert.ok(field('vault').inputs[0].disabled || field('vault').inputs[0].inputEl.readOnly);
  assert.ok(field('file').inputs[0].disabled || field('file').inputs[0].inputEl.readOnly);
  assert.ok(absent('target-mode'));
  assert.equal(uri(bound).searchParams.get('vault'), 'Recipes');
  await select('vault-reference', 'id');
  assert.equal(button('Create shortcut').disabled, true);
  await text('vault-id', 'Recipes');
  await button('Verify ID').click();
  assert.equal(verificationChecks, 0, 'Malformed IDs never reach the CLI boundary');
  await text('vault-id', 'fedcba0987654321');
  await button('Verify ID').click();
  assert.equal(button('Create shortcut').disabled, true);
  assert.ok(bound.contentEl.descendants().some(element => element.textContent.includes('different vault')));
  await text('vault-id', ' 1234567890ABCDEF ');
  await button('Verify ID').click();
  assert.equal(uri(bound).searchParams.get('vault'), vaultId);
  await select('vault-reference', 'name');
  assert.equal(uri(bound).searchParams.get('vault'), 'Recipes');
  await select('vault-reference', 'id');
  assert.equal(uri(bound).searchParams.get('vault'), vaultId, 'Switching modes preserves the verified ID');
  await select('action', 'append');
  assert.equal(uri(bound).searchParams.get('vault'), vaultId, 'The identifier choice persists across actions');
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

  let finishVerification: (value: string) => void = () => {};
  const late = factory({ context: { kind: 'file', vault: 'Recipes', file: 'Clicked.md', markdown: true },
    verifyVaultId: () => new Promise<string>(resolve => { finishVerification = resolve; }), create: () => Promise.resolve(true) });
  late.open();
  await button('Advanced').click();
  await select('vault-reference', 'id');
  await text('vault-id', vaultId);
  const verifying = button('Verify ID').click();
  assert.equal(button('Create shortcut').disabled, true);
  await text('vault-id', 'fedcba0987654321');
  finishVerification(vaultId);
  await verifying;
  assert.equal(button('Create shortcut').disabled, true, 'A stale result cannot verify edited input');
  await select('vault-reference', 'name');
  assert.equal(uri(late).searchParams.get('vault'), 'Recipes', 'Name mode remains available without verification');
  await select('vault-reference', 'id');
  await text('vault-id', vaultId);
  const closedVerification = button('Verify ID').click();
  late.close();
  finishVerification(vaultId);
  await closedVerification;
  assert.equal(late.contentEl.children.length, 0, 'Late ID verification cannot repopulate a closed dialog');

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
  const folderCreations: ShortcutRequest[] = [];
  const folder = factory({ context: { kind: 'folder', vault: 'Recipes', folder: 'Meals & café/Soups' }, create: request => { folderCreations.push(request); return Promise.resolve(false); } });
  folder.open();
  await button('Advanced').click();
  assert.deepEqual([...field('action').dropdowns[0].options.keys()], ['new', 'search']);
  assert.equal(field('action').dropdowns[0].value, 'new');
  assert.equal(field('folder').inputs[0].inputEl.readOnly, true);
  assert.equal(field('vault').inputs[0].inputEl.readOnly, true);
  assert.equal(field('content-source').dropdowns[0].value, 'clipboard');
  assert.ok(absent('target-mode') && absent('file'), 'Folder creation asks for a basename, not an arbitrary target');
  assert.equal(button('Create shortcut').disabled, true, 'A note name is required');
  await text('name', 'Soup.md');
  assert.equal(uri(folder).searchParams.get('file'), 'Meals & café/Soups/Soup.md');
  await text('name', '../Escape.md');
  assert.equal(button('Create shortcut').disabled, true);
  await text('name', 'Soup.md');
  await select('content-source', 'text');
  await text('text', 'Keep my recipe draft');
  await select('action', 'search');
  assert.equal(uri(folder).hostname, 'search');
  assert.equal(field('query').inputs[0].inputEl.readOnly, true);
  const folderQuery = uri(folder).searchParams.get('query');
  await text('query', 'path:Elsewhere');
  await text('folder', 'Elsewhere');
  await text('vault', 'Other');
  assert.equal(uri(folder).searchParams.get('query'), folderQuery);
  await button('Create shortcut').click();
  assert.equal(folderCreations.at(-1)?.action, 'search');
  await select('action', 'new');
  assert.equal(uri(folder).searchParams.get('content'), 'Keep my recipe draft');
  assert.equal(uri(folder).searchParams.get('file'), 'Meals & café/Soups/Soup.md');
  await button('Create shortcut').click();
  assert.equal(folderCreations.at(-1)?.action, 'new');
  folder.close();
  const beforeLinuxIcons = icons.length;
  const linux = factory({ context: { kind: 'general', currentVault: 'Recipes' }, create: () => Promise.resolve(true) });
  linux.open();
  assert.ok(absent('destination'), 'Start-menu destination control is Windows-only');
  assert.equal(icons.length, beforeLinuxIcons + 1, 'Custom icon controls are available beyond Windows');
  linux.close();
  assert.equal(clipboardReads, 0, 'Clipboard source is serialized, never read during setup');
}
