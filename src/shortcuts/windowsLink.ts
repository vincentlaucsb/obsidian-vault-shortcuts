import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { windowsPowerShellPath } from './desktop';
import { shortcutLabel, writeShortcutContent } from './files';
import { buildObsidianUri } from './uri';

const execFileAsync = promisify(execFile);

export async function writeWindowsStartMenuShortcut(
  directory: string, vaultName: string, notePath?: string,
): Promise<string> {
  const uri = buildObsidianUri(vaultName, notePath);
  const temporary = await mkdtemp(join(tmpdir(), 'vault-shortcuts-'));
  try {
    const link = join(temporary, 'shortcut.lnk');
    // Data travels through environment variables, never through PowerShell source.
    // Create privately, then publish with wx: WScript.Save itself can overwrite.
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:VAULT_SHORTCUT_LINK)",
      "$shortcut.TargetPath = Join-Path $env:SystemRoot 'explorer.exe'",
      '$shortcut.Arguments = \'"\' + $env:VAULT_SHORTCUT_URI + \'"\'',
      '$shortcut.Save()',
    ].join('; ');
    await execFileAsync(windowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 10000, maxBuffer: 16384,
      env: { ...process.env, VAULT_SHORTCUT_LINK: link, VAULT_SHORTCUT_URI: uri },
    });
    return await writeShortcutContent(directory, 'lnk', shortcutLabel(vaultName, notePath), await readFile(link));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
