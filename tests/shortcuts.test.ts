import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildObsidianUri } from '../src/shortcuts/uri';
import { sanitizeFilename, serializeDesktopLink, writeShortcut } from '../src/shortcuts/files';
import { getWindowsDesktop, validateDesktop } from '../src/shortcuts/desktop';

async function inTemp(callback: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'vault-shortcut-test-'));
  try { await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

void test('vault and note values round-trip without extra parameters or lines', () => inTemp(async dir => {
  const vault = 'Work & café + 100%';
  const note = 'Projects/雪 & plans+50%.md';
  const file = await writeShortcut(dir, 'url', vault, note);
  const lines = (await readFile(file, 'utf8')).split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '[InternetShortcut]');
  assert.match(lines[1], /%20/);
  assert.match(lines[1], /%2F/);
  const uri = new URL(lines[1].slice(4));
  assert.equal(uri.searchParams.get('vault'), vault);
  assert.equal(uri.searchParams.get('file'), note);
  assert.equal([...uri.searchParams].length, 2);
  const injected = await writeShortcut(dir, 'url', 'A\r\nIconFile=bad');
  assert.equal((await readFile(injected, 'utf8')).split('\r\n').length, 3);
}));

void test('vault-only shortcuts omit file', () => inTemp(async dir => {
  const file = await writeShortcut(dir, 'url', 'My Vault');
  assert.equal(await readFile(file, 'utf8'), '[InternetShortcut]\r\nURL=obsidian://open?vault=My%20Vault\r\n');
}));

void test('simultaneous collisions preserve existing data and allocate unique suffixes', () => inTemp(async dir => {
  const first = await writeShortcut(dir, 'url', 'Vault');
  await writeFile(first, 'Original');
  const files = await Promise.all(Array.from({ length: 8 }, () => writeShortcut(dir, 'url', 'Vault')));
  assert.equal(new Set(files).size, 8);
  assert.ok(files.some(file => basename(file) === 'Vault - Obsidian (9).url'));
  assert.equal(await readFile(first, 'utf8'), 'Original');
}));

void test('unsafe names remain in the destination and Unicode fits byte-based limits', () => inTemp(async dir => {
  for (const label of ['../../escape', 'CON', 'LPT¹.txt', 'NUL.', '...', 'a<>:"/\\|?*\x00', '雪'.repeat(150), '😀'.repeat(100)]) {
    const safe = sanitizeFilename(label);
    assert.doesNotMatch(safe, /[<>:"/\\|?*]|[. ]$/);
    assert.ok(Array.from(safe).every(character => character.charCodeAt(0) >= 32));
    assert.ok(Buffer.byteLength(safe) <= 181);
    assert.equal(Buffer.from(safe).toString(), safe);
    const file = await writeShortcut(dir, 'url', label);
    assert.equal(dirname(file), dir);
  }
  assert.equal(sanitizeFilename('CON.txt'), '_CON.txt');
}));

void test('missing destinations and ambiguous targets fail', () => inTemp(async dir => {
  await assert.rejects(writeShortcut(join(dir, 'missing'), 'url', 'Vault'), { code: 'ENOENT' });
  await assert.rejects(writeShortcut(dir, 'url', 'Vault', 'A#B.md'), /# in their path/);
  await assert.rejects(writeShortcut(dir, 'url', ''), /no name/);
  await assert.rejects(writeShortcut('relative', 'url', 'Vault'), /absolute/);
  assert.throws(() => buildObsidianUri('Vault', ''), /no path/);
}));

void test('Linux links escape Name and retain URL percent encoding without Exec fields', () => inTemp(async dir => {
  const uri = buildObsidianUri('100% & Work', 'A B.md');
  const content = serializeDesktopLink(' A\\B\nType=Application\t', uri);
  assert.equal(content, `[Desktop Entry]\nType=Link\nName=\\sA\\\\B\\nType=Application\\t\nURL=${uri}\nIcon=obsidian\n`);
  assert.doesNotMatch(content, /%%|\nExec=/);
  const file = await writeShortcut(dir, 'desktop', 'Vault', 'Nested/Note.md');
  assert.match(file, /\.desktop$/);
  assert.match(await readFile(file, 'utf8'), /file=Nested%2FNote.md/);
}));

void test('Desktop validation rejects disabled Linux Desktop and invalid directories', () => inTemp(async dir => {
  assert.equal(await validateDesktop(dir), dir);
  await assert.rejects(validateDesktop(dir, dir), /No Desktop/);
  await assert.rejects(validateDesktop(''), /No Desktop/);
  await assert.rejects(validateDesktop('relative'), /No Desktop/);
  const file = join(dir, 'file');
  await writeFile(file, 'test');
  await assert.rejects(validateDesktop(file), /not a folder/);
}));

void test('Windows resolves an existing actual Desktop', { skip: process.platform !== 'win32' }, async () => {
  assert.ok((await stat(await getWindowsDesktop())).isDirectory());
});

void test('attachment shortcuts retain the complete file extension and encoded path', () => inTemp(async dir => {
  for (const path of ['Photos/Truck & trailer.jpg', 'Reports/Fuel 2026.csv']) {
    const shortcut = await writeShortcut(dir, 'url', 'Truck', path);
    const contents = await readFile(shortcut, 'utf8');
    const uri = new URL(contents.split('\r\n')[1].slice(4));
    assert.equal(uri.searchParams.get('file'), path);
    assert.ok(basename(shortcut).includes(path.split('/').pop() ?? ''));
  }
}));
