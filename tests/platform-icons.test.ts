import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { getIconDirectory, PNG_ICON_SIZE, storePngIcon, validatePngIcon } from '../src/icons';
import { serializeDesktopLink, writeShortcut, writeTagShortcut, writeRequestShortcut } from '../src/shortcuts/files';
import { macIconArguments } from '../src/shortcuts/macIconBridge';
import { transparentPng } from './png-fixture';

void test('native icon storage uses platform data folders and durable content-based PNG assets', async () => {
  const original = process.env.XDG_DATA_HOME;
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-png-'));
  try {
    process.env.XDG_DATA_HOME = '/home/test/Data 雪';
    assert.equal(getIconDirectory('linux', '/home/test'), '/home/test/Data 雪/vault-shortcuts/icons');
    process.env.XDG_DATA_HOME = 'relative';
    assert.equal(getIconDirectory('linux', '/home/test'), posix.join('/home/test', '.local', 'share', 'vault-shortcuts', 'icons'));
    assert.equal(getIconDirectory('macos', '/Users/test'), posix.join('/Users/test', 'Library', 'Application Support', 'VaultShortcuts', 'Icons'));
    const png = transparentPng(PNG_ICON_SIZE);
    validatePngIcon(png);
    assert.throws(() => validatePngIcon(transparentPng(16)), /invalid PNG/);
    const paths = await Promise.all(Array.from({ length: 6 }, () => storePngIcon(png, 'linux', directory)));
    assert.equal(new Set(paths).size, 1);
    assert.match(paths[0], /[a-f0-9]{64}\.png$/);
    assert.deepEqual(await readFile(paths[0]), png);
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

void test('Linux custom Icon values escape paths without introducing keys, commands or changing URIs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-linux-icon-'));
  try {
    const iconPath = '/home/café 雪/Icons/back\\slash;$(echo unused)%icon.png';
    const options = { iconPath };
    const content = serializeDesktopLink('Soup', 'obsidian://open?vault=Recipes', options);
    const line = content.split('\n').find(value => value.startsWith('Icon='));
    assert.equal(line, 'Icon=/home/café\\s雪/Icons/back\\\\slash;$(echo\\sunused)%icon.png');
    assert.doesNotMatch(content, /\nExec=/);
    for (const path of ['relative.png', 'C:\\Icons\\image.png', '/tmp/a\nURL=evil', '/tmp/a\rIcon=evil']) {
      assert.throws(() => serializeDesktopLink('Soup', 'obsidian://open', { iconPath: path }), /absolute filesystem path/);
    }
    const files = await Promise.all([
      writeShortcut(directory, 'desktop', 'Recipes', undefined, options),
      writeShortcut(directory, 'desktop', 'Recipes', 'Soup.jpg', options),
      writeTagShortcut(directory, 'desktop', 'Recipes', '#meals/soup', options),
      writeRequestShortcut(directory, 'desktop', { action: 'search', vault: 'Recipes', query: 'tag:#soup' }, 'Search', options),
    ]);
    for (const file of files) assert.ok((await readFile(file, 'utf8')).includes(line ?? 'Missing Icon'));
    assert.match(await readFile(files[1], 'utf8'), /file=Soup.jpg/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

void test('macOS typed bridge uses AppKit and passes arbitrary file paths as arguments, never source', () => {
  const imagePath = '/Users/café 雪/Icons/$(example);".png';
  const shortcutPath = '/Users/café 雪/Desktop/Recipe \'quoted\'.url';
  const args = macIconArguments(imagePath, shortcutPath);
  assert.deepEqual(args.slice(0, 3), ['-l', 'JavaScript', '-e']);
  const script = args[3];
  assert.ok(!script.includes(imagePath) && !script.includes(shortcutPath));
  const calls: string[] = [];
  let nil = false, success = true;
  const image = { isNil: (): boolean => nil };
  const context = {
    ObjC: { import: (framework: string): void => { calls.push(framework); } },
    $: {
      NSImage: { alloc: { initWithContentsOfFile: (path: string) => { assert.equal(path, imagePath); return image; } } },
      NSWorkspace: { sharedWorkspace: { setIconForFileOptions: (value: unknown, path: string, options: number) => {
        assert.equal(value, image); assert.equal(path, shortcutPath); assert.equal(options, 0); calls.push('setIcon'); return success;
      } } },
    },
    argv: args.slice(4),
  };
  runInNewContext(script + ';run(argv);', context, { timeout: 1000 });
  assert.deepEqual(calls, ['AppKit', 'setIcon']);
  success = false;
  assert.throws(() => runInNewContext(script + ';run(argv);', context), /could not attach/);
  nil = true;
  assert.throws(() => runInNewContext(script + ';run(argv);', context), /could not load/);
});
