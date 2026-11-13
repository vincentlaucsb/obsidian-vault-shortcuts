import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { availableActions, draftFromRequest, initialDraft, requestFromDraft } from '../src/UriForm';
import { buildShortcutUri, folderSearchQuery } from '../src/shortcuts/requests';
import type { ShortcutContext, ShortcutRequest } from '../src/shortcuts/requests';
import { writeRequestShortcut } from '../src/shortcuts/files';

void test('folder forms bind new notes and searches to root, nested and Unicode folders', () => {
  for (const folder of ['', 'Meals', 'Meals & café/雪 soups', 'Meals (quick) [1].+']) {
    const context: ShortcutContext = { kind: 'folder', vault: 'Recipes', folder };
    assert.deepEqual(availableActions(context), ['new', 'search']);
    const draft = initialDraft(context, 'new');
    assert.throws(() => requestFromDraft('new', draft, context), /note name/);
    draft.name = 'Soup.md'; draft.vault = 'Injected'; draft.file = 'Elsewhere/Injected.md'; draft.targetMode = 'path'; draft.path = '/tmp/Injected.md';
    const request = requestFromDraft('new', draft, context);
    const parameters = new URL(buildShortcutUri(request, context)).searchParams;
    assert.equal(parameters.get('vault'), 'Recipes');
    assert.equal(parameters.get('file'), `${folder ? `${folder}/` : ''}Soup.md`);
    assert.equal(parameters.get('clipboard'), 'true');
    assert.equal(parameters.has('path') || parameters.has('name'), false);
    assert.equal(draftFromRequest(request, context).draft.name, 'Soup.md');
    for (const name of ['../Escape', 'Nested/Escape', 'Nested\\Escape', '.', '..', '#heading', '']) {
      draft.name = name;
      assert.throws(() => requestFromDraft('new', draft, context), /note name/);
    }
    draft.query = 'path:Elsewhere';
    const search = requestFromDraft('search', draft, context);
    assert.equal(new URL(buildShortcutUri(search, context)).searchParams.get('query'), folderSearchQuery(folder));
    assert.throws(() => requestFromDraft('daily', draft, context), /cannot target/);
  }
});

void test('folder search anchors and escapes regex delimiters and metacharacters without matching siblings', () => {
  for (const folder of ['Meals', 'Meals/Soups', '雪 (quick) [1].+ $^{}|?', 'Quotes " OR tag:#all']) {
    const query = folderSearchQuery(folder);
    assert.ok(query.startsWith('match-case:(path:/'));
    const pattern = new RegExp(query.slice('match-case:(path:/'.length, -2));
    assert.equal(pattern.test(`${folder}/Soup.md`), true);
    assert.equal(pattern.test(`${folder}/Nested/Soup.md`), true);
    assert.equal(pattern.test(`${folder} extra/Soup.md`), false);
    assert.equal(pattern.test(`Elsewhere/${folder}/Soup.md`), false);
    assert.equal(pattern.test(`${folder.toLowerCase()}/Soup.md`), folder === folder.toLowerCase());
  }
  assert.equal(folderSearchQuery(''), 'match-case:(path:/^/)');
  for (const folder of ['../Meals', '/Meals', 'Meals//Soups', 'Meals\\Soups', 'C:/Meals', 'Meals\nOR']) {
    assert.throws(() => folderSearchQuery(folder));
  }
});

void test('folder context rejects alternate locations and unrelated actions at model and writer boundaries', async () => {
  const context: ShortcutContext = { kind: 'folder', vault: 'Recipes', folder: 'Meals' };
  const newRequest: ShortcutRequest = { action: 'new', target: { kind: 'vault', vault: 'Recipes', file: 'Meals/Soup.md' }, mode: 'create', content: { kind: 'clipboard' } };
  const rejected: ShortcutRequest[] = [
    { ...newRequest, target: { kind: 'vault', vault: 'Recipes', file: 'Meals extra/Soup.md' } },
    { ...newRequest, target: { kind: 'vault', vault: 'Recipes', file: 'Meals/Nested/Soup.md' } },
    { ...newRequest, target: { kind: 'vault', vault: 'Other', file: 'Meals/Soup.md' } },
    { ...newRequest, target: { kind: 'name', vault: 'Recipes', name: 'Soup' } },
    { ...newRequest, target: { kind: 'path', path: 'C:\\Meals\\Soup.md' } },
    { ...newRequest, mode: 'replace' },
    { ...newRequest, target: { kind: 'vault', vault: 'Recipes', file: 'Meals/../Escape.md' } },
    { action: 'search', vault: 'Recipes', query: 'path:Meals OR path:Other' },
    { action: 'search', vault: 'Other', query: folderSearchQuery('Meals') },
    { action: 'open', target: { kind: 'vault', vault: 'Recipes', file: 'Meals' } },
    { action: 'choose-vault' },
    { action: 'unique', vault: 'Recipes', content: { kind: 'clipboard' } },
  ];
  const directory = await mkdtemp(join(tmpdir(), 'vault-folder-shortcuts-'));
  try {
    for (const request of rejected) {
      assert.throws(() => buildShortcutUri(request, context));
      await assert.rejects(writeRequestShortcut(directory, 'url', request, 'Invalid', undefined, context));
    }
    assert.deepEqual(await readdir(directory), []);
    for (const request of [newRequest, { action: 'search' as const, vault: 'Recipes', query: folderSearchQuery('Meals') }]) {
      const path = await writeRequestShortcut(directory, 'url', request, 'Folder shortcut', undefined, context);
      assert.ok((await readFile(path, 'utf8')).includes(buildShortcutUri(request, context)));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
