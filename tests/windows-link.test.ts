import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { getWindowsStartMenu, windowsPowerShellPath } from '../src/shortcuts/desktop';
import { buildObsidianUri } from '../src/shortcuts/uri';
import { writeWindowsStartMenuShortcut } from '../src/shortcuts/windowsLink';

const execFileAsync = promisify(execFile);

void test('Windows shell links preserve encoded targets and existing files', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-shortcuts-link-test-'));
  try {
    const vault = 'Work & café + 100%';
    const note = "Folder/O'Brien & 雪 50%.md";
    const link = await writeWindowsStartMenuShortcut(directory, vault, note);
    assert.match(link, /\.lnk$/);
    // WScript's path handling can fail on Unicode/percent filenames. Inspect the
    // same binary under a plain name; Node still creates the intended user label.
    const inspectionLink = join(directory, 'inspect.lnk');
    await copyFile(link, inspectionLink);
    const script = [
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '$link = (New-Object -ComObject WScript.Shell).CreateShortcut($env:VAULT_SHORTCUT_TEST_LINK)',
      '@{target=$link.TargetPath; arguments=$link.Arguments} | ConvertTo-Json -Compress',
    ].join('; ');
    const { stdout } = await execFileAsync(windowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 10000, encoding: 'utf8',
      env: { ...process.env, VAULT_SHORTCUT_TEST_LINK: inspectionLink },
    });
    const details: unknown = JSON.parse(stdout);
    assert.ok(typeof details === 'object' && details !== null && 'target' in details && 'arguments' in details);
    assert.equal(typeof details.target, 'string');
    if (typeof details.target !== 'string') throw new Error('Missing shortcut target');
    assert.equal(basename(details.target).toLowerCase(), 'explorer.exe');
    assert.equal(details.arguments, `"${buildObsidianUri(vault, note)}"`);
    await writeFile(link, 'Original');
    const copies = await Promise.all([1, 2].map(() => writeWindowsStartMenuShortcut(directory, vault, note)));
    assert.equal(new Set(copies).size, 2);
    assert.equal(await readFile(link, 'utf8'), 'Original');
    const vaultLink = await writeWindowsStartMenuShortcut(directory, vault);
    assert.match(vaultLink, /\.lnk$/);
    assert.ok(await getWindowsStartMenu());
  } finally { await rm(directory, { recursive: true, force: true }); }
});
