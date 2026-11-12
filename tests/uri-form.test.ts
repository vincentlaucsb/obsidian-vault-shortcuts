import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableActions, draftFromRequest, initialDraft, requestFromDraft } from '../src/UriForm';
import { buildShortcutUri } from '../src/shortcuts/requests';
import type { ShortcutContext } from '../src/shortcuts/requests';

const general: ShortcutContext = { kind: 'general', currentVault: 'Recipes' };

void test('bound files default to their name and use only a host-verified ID when requested', () => {
  const context: ShortcutContext = { kind: 'file', vault: 'Recipes', file: 'Dinner.md', markdown: true, vaultId: '1234567890abcdef' };
  for (const action of ['open', 'append', 'prepend', 'replace'] as const) {
    const draft = initialDraft(context, action);
    assert.equal(draft.vaultReference, 'name');
    draft.vault = 'Another vault';
    assert.equal(new URL(buildShortcutUri(requestFromDraft(action, draft, context), context)).searchParams.get('vault'), 'Recipes');
    draft.vaultReference = 'id';
    assert.equal(new URL(buildShortcutUri(requestFromDraft(action, draft, context), context)).searchParams.get('vault'), context.vaultId);
    assert.throws(() => requestFromDraft(action, draft, { ...context, vaultId: undefined }), /Verify this vault ID/);
  }
});

void test('form requests use immutable clicked identities and restrict attachments to opening', () => {
  const note: ShortcutContext = { kind: 'file', vault: 'Recipes', file: 'Meals/Dinner.md', markdown: true };
  const draft = initialDraft(note, 'append');
  draft.vault = 'Other'; draft.file = 'Other.md'; draft.targetMode = 'path'; draft.path = 'C:\\Other.md';
  draft.contentSource = 'text'; draft.text = 'Dinner';
  const request = requestFromDraft('append', draft, note);
  assert.match(buildShortcutUri(request, note), /vault=Recipes&file=Meals%2FDinner.md/);
  const attachment: ShortcutContext = { kind: 'file', vault: 'Recipes', file: 'Dinner.jpg', markdown: false };
  assert.deepEqual(availableActions(attachment), ['open']);
  assert.throws(() => requestFromDraft('replace', draft, attachment), /clicked file/);
});

void test('form omits inactive text, merge flags, navigation and pane options', () => {
  const draft = initialDraft(general, 'replace');
  draft.file = 'Dinner.md'; draft.text = 'Private hidden text'; draft.contentSource = 'clipboard';
  draft.heading = 'Stale heading'; draft.spacing = 'inline'; draft.pane = 'window'; draft.silent = true;
  const uri = new URL(buildShortcutUri(requestFromDraft('replace', draft, general), general));
  assert.equal(uri.searchParams.get('clipboard'), 'true');
  assert.equal(uri.searchParams.get('overwrite'), 'true');
  for (const key of ['content', 'heading', 'spacing', 'paneType', 'append', 'prepend']) assert.equal(uri.searchParams.has(key), false);
  draft.targetMode = 'file'; draft.file = 'Dinner.jpg'; draft.navigation = 'heading'; draft.anchor = 'Invisible';
  const attachmentUri = new URL(buildShortcutUri(requestFromDraft('open', draft, general), general));
  assert.equal(attachmentUri.searchParams.get('file'), 'Dinner.jpg');
});

void test('daily open clears hidden capture flags and restores opening options', () => {
  const draft = initialDraft(general, 'daily');
  draft.silent = true; draft.pane = 'window'; draft.heading = 'Meals'; draft.text = 'Hidden'; draft.contentSource = 'text';
  draft.dailyMode = 'open';
  const request = requestFromDraft('daily', draft, general);
  const uri = new URL(buildShortcutUri(request, general));
  assert.equal(uri.searchParams.get('paneType'), 'window');
  for (const key of ['silent', 'content', 'clipboard', 'heading', 'spacing', 'append', 'prepend', 'overwrite']) assert.equal(uri.searchParams.has(key), false);
});

void test('presets round-trip without losing nested tags or callback fields', () => {
  const initial = { action: 'search' as const, vault: 'Recipes', query: 'tag:#meals/dinner' };
  const { action, draft } = draftFromRequest(initial, general);
  assert.deepEqual(requestFromDraft(action, draft, general), initial);
  const write = { action: 'new' as const, target: { kind: 'vault' as const, vault: 'Recipes', file: 'Dinner.md' }, mode: 'prepend' as const,
    content: { kind: 'clipboard' as const }, heading: 'Meals', spacing: 'newline' as const, xSuccess: 'app://done?name=meal' };
  const seeded = draftFromRequest(write, general);
  assert.equal(seeded.action, 'prepend');
  assert.equal(buildShortcutUri(requestFromDraft(seeded.action, seeded.draft, general), general), buildShortcutUri(write, general));
});
