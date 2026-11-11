import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildShortcutUri } from '../src/shortcuts/requests';
import type { ShortcutContext, ShortcutRequest } from '../src/shortcuts/requests';
import { writeRequestShortcut } from '../src/shortcuts/files';

const fixed: ShortcutContext = { kind: 'file', vault: 'Recipes & café', file: 'Meals/雪 soup.md', markdown: true };
const target = { kind: 'vault', vault: fixed.vault, file: fixed.file } as const;

function parameters(request: ShortcutRequest, context?: ShortcutContext): [string, string][] {
  return [...new URL(buildShortcutUri(request, context)).searchParams];
}

void test('open targets and separate Markdown navigation encode each parameter once', () => {
  const request: ShortcutRequest = { action: 'open', target, navigation: { kind: 'heading', value: 'Ingredients & 50%' }, paneType: 'window' };
  const uri = buildShortcutUri(request, fixed);
  assert.deepEqual(parameters(request, fixed), [['vault', fixed.vault], ['file', `${fixed.file}#Ingredients & 50%`], ['paneType', 'window']]);
  assert.ok(uri.includes('Meals%2F%E9%9B%AA%20soup.md%23Ingredients%20%26%2050%25'));
  assert.deepEqual(parameters({ action: 'open', target, navigation: { kind: 'block', value: 'ingredients-42' } }, fixed),
    [['vault', fixed.vault], ['file', `${fixed.file}#^ingredients-42`]]);
  assert.deepEqual(parameters({ action: 'open', target: { kind: 'path', path: 'C:\\Recipes & café\\Soup.md' } }), [['path', 'C:\\Recipes & café\\Soup.md']]);
  assert.deepEqual(parameters({ action: 'open', target: { kind: 'path', path: '/home/雪/Recipes/Soup.md' } }), [['path', '/home/雪/Recipes/Soup.md']]);
  assert.throws(() => buildShortcutUri({ action: 'open', target: { kind: 'path', path: 'relative.md' } }), /absolute/);
  assert.throws(() => buildShortcutUri({ action: 'open', target: { kind: 'vault', vault: 'Recipes' }, paneType: 'tab' }), /require a file/);
  assert.throws(() => buildShortcutUri({ action: 'open', target: { ...target, file: 'Soup#special.md' } }), /# in their path/);
  assert.throws(() => buildShortcutUri({ action: 'open', target: { ...target, file: '../Other.md' } }), /relative to the vault/);
});

void test('bound-file context rejects alternate targets and unrelated actions at model boundary', () => {
  const invalid: ShortcutRequest[] = [
    { action: 'open', target: { ...target, vault: 'Other' } },
    { action: 'open', target: { ...target, file: 'Other.md' } },
    { action: 'open', target: { kind: 'path', path: 'C:\\Recipes\\Soup.md' } },
    { action: 'new', target, mode: 'create', content: { kind: 'none' } },
    { action: 'search', vault: fixed.vault, query: 'soup' },
    { action: 'daily', vault: fixed.vault, mode: 'create', content: { kind: 'none' } },
    { action: 'unique', vault: fixed.vault, content: { kind: 'none' } },
    { action: 'choose-vault' }, { action: 'hook-get-address' },
  ];
  for (const request of invalid) assert.throws(() => buildShortcutUri(request, fixed));
  const attachment: ShortcutContext = { kind: 'file', vault: 'Recipes', file: 'Soup.jpg', markdown: false };
  const attachmentTarget = { kind: 'vault', vault: attachment.vault, file: attachment.file } as const;
  assert.doesNotThrow(() => buildShortcutUri({ action: 'open', target: attachmentTarget }, attachment));
  assert.throws(() => buildShortcutUri({ action: 'open', target: attachmentTarget, navigation: { kind: 'heading', value: 'A' } }, attachment), /Attachments/);
  assert.throws(() => buildShortcutUri({ action: 'new', target: attachmentTarget, mode: 'replace', content: { kind: 'text', text: 'x' } }, attachment), /Attachments/);
});

void test('write operations serialize one mode and one content source, including literal multiline text', () => {
  const text = 'Milk & café\n雪 50%\r\n- eggs';
  assert.deepEqual(parameters({ action: 'new', target, mode: 'append', content: { kind: 'text', text }, heading: 'Ingredients', spacing: 'newline' }, fixed),
    [['vault', fixed.vault], ['file', fixed.file], ['append', 'true'], ['content', text], ['heading', 'Ingredients'], ['spacing', 'newline']]);
  const clipboard = parameters({ action: 'new', target, mode: 'prepend', content: { kind: 'clipboard' }, silent: true }, fixed);
  assert.deepEqual(clipboard, [['vault', fixed.vault], ['file', fixed.file], ['prepend', 'true'], ['clipboard', 'true'], ['silent', 'true']]);
  assert.deepEqual(parameters({ action: 'new', target, mode: 'replace', content: { kind: 'text', text: '' } }, fixed),
    [['vault', fixed.vault], ['file', fixed.file], ['overwrite', 'true'], ['content', '']]);
  for (const mode of ['create', 'replace'] as const) {
    assert.throws(() => buildShortcutUri({ action: 'new', target, mode, content: { kind: 'text', text }, heading: 'Hidden stale heading' }), /require append or prepend/);
  }
  assert.throws(() => buildShortcutUri({ action: 'new', target, mode: 'append', content: { kind: 'none' } }), /text or clipboard/);
  for (const mode of ['create', 'append', 'prepend', 'replace'] as const) {
    assert.throws(() => buildShortcutUri({ action: 'new', target: { kind: 'vault', vault: 'Recipes', file: 'Photo.jpg' }, mode, content: { kind: 'clipboard' } }), /Markdown note/);
    assert.throws(() => buildShortcutUri({ action: 'new', target: { kind: 'path', path: 'C:\\Recipes\\Data.csv' }, mode, content: { kind: 'clipboard' } }), /Markdown note/);
  }
  assert.throws(() => buildShortcutUri({ action: 'new', target, mode: 'append', content: { kind: 'clipboard' }, silent: true, paneType: 'tab' }), /suppressed/);
  const general: ShortcutContext = { kind: 'general', currentVault: fixed.vault };
  assert.doesNotThrow(() => buildShortcutUri({ action: 'new', target: { kind: 'name', vault: fixed.vault, name: 'Soup' }, mode: 'create', content: { kind: 'none' } }, general));
  assert.throws(() => buildShortcutUri({ action: 'new', target: { kind: 'name', vault: 'Other', name: 'Soup' }, mode: 'create', content: { kind: 'none' } }, general), /current vault/);
});

void test('daily, unique, search, manager and Hook emit only their supported active parameters', () => {
  assert.deepEqual(parameters({ action: 'daily', vault: 'Recipes', mode: 'create', content: { kind: 'none' } }), [['vault', 'Recipes']]);
  assert.deepEqual(parameters({ action: 'daily', vault: 'Recipes', mode: 'append', content: { kind: 'clipboard' }, heading: 'Log', spacing: 'inline' }),
    [['vault', 'Recipes'], ['append', 'true'], ['clipboard', 'true'], ['heading', 'Log'], ['spacing', 'inline']]);
  assert.deepEqual(parameters({ action: 'unique', vault: 'Recipes', content: { kind: 'text', text: 'Dinner' }, paneType: 'split' }),
    [['vault', 'Recipes'], ['content', 'Dinner'], ['paneType', 'split']]);
  assert.equal(buildShortcutUri({ action: 'choose-vault' }), 'obsidian://choose-vault');
  assert.equal(buildShortcutUri({ action: 'hook-get-address' }), 'obsidian://hook-get-address');
  assert.deepEqual(parameters({ action: 'search', vault: 'Recipes', query: 'tag:#cooking/soup OR "雪 & café"' }),
    [['vault', 'Recipes'], ['query', 'tag:#cooking/soup OR "雪 & café"']]);
  assert.deepEqual(parameters({ action: 'search', vault: 'Recipes', query: '' }), [['vault', 'Recipes'], ['query', '']]);
});

void test('callbacks encode nested URLs once and reject executable schemes and injected line breaks', () => {
  const destination = 'myapp://x-callback-url/result?name=雪 & source=recipe%20book';
  assert.deepEqual(parameters({ action: 'unique', vault: 'Recipes', content: { kind: 'none' }, xSuccess: destination }), [['vault', 'Recipes'], ['x-success', destination]]);
  assert.deepEqual(parameters({ action: 'hook-get-address', xSuccess: 'https://example.com/done?a=1&b=2', xError: 'myapp://error' }),
    [['x-success', 'https://example.com/done?a=1&b=2'], ['x-error', 'myapp://error']]);
  for (const value of ['no-scheme', 'javascript:alert(1)', 'data:text/plain,test', 'file:///C:/test', 'https://example.com\r\nIconFile=evil']) {
    assert.throws(() => buildShortcutUri({ action: 'hook-get-address', xSuccess: value }));
  }
  assert.throws(() => buildShortcutUri({ action: 'search', vault: 'Recipes\nIconFile=evil' }), /control characters/);
});

void test('generic writer rechecks context and preserves filenames independently from URI targets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-requests-'));
  try {
    const request: ShortcutRequest = { action: 'new', target, mode: 'append', content: { kind: 'clipboard' } };
    const first = await writeRequestShortcut(directory, 'url', request, '../../Friendly label', undefined, fixed);
    assert.deepEqual(new URL((await readFile(first, 'utf8')).split('\r\n')[1].slice(4)).searchParams.get('file'), fixed.file);
    await writeFile(first, 'Existing');
    const second = await writeRequestShortcut(directory, 'url', request, '../../Friendly label', undefined, fixed);
    assert.notEqual(first, second);
    assert.equal(await readFile(first, 'utf8'), 'Existing');
    await assert.rejects(writeRequestShortcut(directory, 'url', { action: 'choose-vault' }, 'Invalid context', undefined, fixed), /clicked file/);
    const desktop = await writeRequestShortcut(directory, 'desktop', { action: 'search', vault: 'Recipes', query: 'tag:#soup' }, 'Soup');
    assert.match(await readFile(desktop, 'utf8'), /Type=Link\nName=Soup\nURL=obsidian:\/\/search\?/);
    const customIcon = 'C:\\Users\\café 雪\\Icons\\soup.ico';
    const custom = await writeRequestShortcut(directory, 'url', request, 'With icon', { iconPath: customIcon }, fixed);
    const customData = await readFile(custom);
    assert.equal(customData.readUInt16LE(0), 0xfeff);
    assert.ok(customData.toString('utf16le').includes(`IconFile=${customIcon}\r\n`));
    await assert.rejects(writeRequestShortcut(directory, 'url', request, ' '), /shortcut name/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
