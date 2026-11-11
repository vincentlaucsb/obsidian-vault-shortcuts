import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { writeShortcut, writeTagShortcut } from '../src/shortcuts/files';

const runFile = promisify(execFile);
// Fixed native INI reader: paths are passed in the child environment, never shell code.
const READ_ICON_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System.Text;
using System.Runtime.InteropServices;
public class ShortcutIconIniReader {
  [DllImport("kernel32", CharSet=CharSet.Unicode)]
  static extern uint GetPrivateProfileString(string section, string key, string fallback, StringBuilder value, uint size, string path);
  public static string Read(string path) {
    var value = new StringBuilder(4096);
    GetPrivateProfileString("InternetShortcut", "IconFile", "", value, 4096, path);
    return value.ToString();
  }
}
'@
if ([ShortcutIconIniReader]::Read($env:VAULT_SHORTCUT_TEST_FILE) -cne $env:VAULT_SHORTCUT_TEST_ICON) {
  throw 'Windows did not read the exact Unicode icon path.'
}
Write-Output 'Unicode icon path preserved'
`;

void test('Windows native INI parsing preserves custom icon paths with spaces and Unicode',
  { skip: process.platform !== 'win32' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortcut-native-icon-'));
    try {
      const iconPath = join(directory, 'café 雪 icon.ico');
      const files = [
        await writeShortcut(directory, 'url', 'Recipes', 'Meals/Soup.md', { iconPath }),
        await writeTagShortcut(directory, 'url', 'Recipes', '#meals/soup', { iconPath }),
      ];
      const systemRoot = process.env.SystemRoot;
      assert.ok(systemRoot, 'Windows system directory must be available');
      for (const file of files) {
        const result = await runFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', READ_ICON_SCRIPT], {
            windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024,
            env: { ...process.env, VAULT_SHORTCUT_TEST_FILE: file, VAULT_SHORTCUT_TEST_ICON: iconPath },
          });
        assert.match(result.stdout, /Unicode icon path preserved/);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
