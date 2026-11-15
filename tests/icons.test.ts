import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createIco, ICON_SIZES, storeIcon, validateIco, validateIconPath } from '../src/icons';
import { serializeUrl, writeShortcut, writeTagShortcut } from '../src/shortcuts/files';
import { windowsPowerShellPath } from '../src/shortcuts/desktop';

import { transparentPng } from './png-fixture';

const icon = (): Buffer => createIco(ICON_SIZES.map(size => ({ size, png: transparentPng(size) })));

void test('ICO conversion packages real transparent PNG images at all supported resolutions', () => {
  const ico = icon();
  validateIco(ico);
  assert.equal(ico.readUInt16LE(4), 4);
  for (const [index, size] of ICON_SIZES.entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry] || 256, size);
    const image = ico.subarray(ico.readUInt32LE(entry + 12));
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image[25], 6, 'RGBA data preserves transparency');
  }
  assert.throws(() => createIco([]), /required/);
  assert.throws(() => createIco([{ size: 256, png: transparentPng(16) }]), /invalid PNG/);
});

void test('ICO import rejects truncated, oversized, overlapping and invalid payloads', () => {
  const valid = icon();
  for (const data of [Buffer.alloc(0), Buffer.alloc(21 * 1024 * 1024), valid.subarray(0, 30), valid.subarray(0, valid.length - 1)]) {
    assert.throws(() => validateIco(data));
  }
  const overlap = Buffer.from(valid);
  overlap.writeUInt32LE(overlap.readUInt32LE(18), 34);
  assert.throws(() => validateIco(overlap), /overlapping/);
  const invalidPng = Buffer.from(valid);
  invalidPng.writeUInt32BE(5, invalidPng.readUInt32LE(18) + 16);
  assert.throws(() => validateIco(invalidPng), /invalid PNG/);
});

void test('durable imports exclusively deduplicate concurrent icons and preserve assets independently of sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shortcut-icons-'));
  try {
    const source = join(root, 'original.ico');
    const data = icon();
    await writeFile(source, data);
    const directory = join(root, 'local café 雪', 'Icons');
    const destinations = await Promise.all(Array.from({ length: 8 }, () => storeIcon(data, directory)));
    assert.equal(new Set(destinations).size, 1);
    await rm(source);
    assert.deepEqual(await readFile(destinations[0]), data);
    assert.equal((await readdir(directory)).length, 1, 'temporary imports are cleaned up');
    await writeFile(destinations[0], 'damaged existing asset');
    await assert.rejects(storeIcon(data, directory), /damaged/);
    assert.equal(await readFile(destinations[0], 'utf8'), 'damaged existing asset');
    await assert.rejects(storeIcon(data, 'relative'), /absolute/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('icon serialization preserves Unicode paths and targets while rejecting injected fields and nonlocal paths', async () => {
  const iconPath = 'C:\\Users\\café 雪\\AppData\\Local\\VaultShortcuts\\Icons\\sample.ico';
  const uri = 'obsidian://open?vault=Recipes';
  assert.equal(serializeUrl(uri, { iconPath }), `[InternetShortcut]\r\nURL=${uri}\r\nIconFile=${iconPath}\r\nIconIndex=0\r\n`);
  assert.equal(serializeUrl(uri), `[InternetShortcut]\r\nURL=${uri}\r\n`);
  for (const bad of ['relative.ico', '\\\\server\\share\\a.ico', 'C:relative.ico', 'C:\\image\r\nURL=evil', 'C:\\%TEMP%\\a.ico']) {
    assert.throws(() => validateIconPath(bad), /absolute local Windows path/);
  }
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-icons-'));
  try {
    const file = await writeShortcut(directory, 'url', 'Recipes', 'Meals/Café.md', { iconPath });
    const tag = await writeTagShortcut(directory, 'url', 'Recipes', '#meals/soup', { iconPath });
    assert.equal((await readFile(file)).readUInt16LE(0), 0xfeff);
    assert.match(await readFile(file, 'utf16le'), /file=Meals%2FCaf%C3%A9.md/);
    assert.ok((await readFile(tag, 'utf16le')).includes(`IconFile=${iconPath}`));
    assert.match(await readFile(tag, 'utf16le'), /query=tag%3A%23meals%2Fsoup/);
    const another = await writeShortcut(directory, 'url', 'Recipes', 'Meals/Café.md', { iconPath });
    assert.notEqual(file, another);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

void test('Windows natively decodes transparent multi-resolution ICO at a Unicode path', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-icon-'));
  try {
    const path = await storeIcon(icon(), join(directory, 'café 雪 with spaces'));
    // All code is fixed; the test path is supplied through the environment.
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeIcon {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr LoadImageW(IntPtr instance, string name, uint type, int width, int height, uint flags);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr icon);
}
"@
foreach ($size in @(16, 32, 48, 256)) {
  $handle = [NativeIcon]::LoadImageW([IntPtr]::Zero, $env:VAULT_SHORTCUT_TEST_ICON, 1, $size, $size, 16)
  if ($handle -eq [IntPtr]::Zero) { throw "Windows could not load the icon" }
  try {
    $bitmap = [System.Drawing.Bitmap]::FromHicon($handle)
    try {
      if ($bitmap.Width -ne $size -or $bitmap.Height -ne $size) { throw 'Unexpected native icon dimensions' }
      if ($bitmap.GetPixel(0, 0).A -ne 0) { throw 'Native icon lost transparency' }
    } finally { $bitmap.Dispose() }
  } finally { [void][NativeIcon]::DestroyIcon($handle) }
}
[Console]::Write('OK')
`;
    const result = await promisify(execFile)(windowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, VAULT_SHORTCUT_TEST_ICON: path },
      windowsHide: true, timeout: 10000, maxBuffer: 16384, encoding: 'utf8',
    });
    assert.equal(result.stdout, 'OK');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
