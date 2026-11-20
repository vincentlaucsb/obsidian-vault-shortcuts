import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { getWindowsSendTo, windowsPowerShellPath, windowsSystemDirectory } from '../shortcuts/desktop';
import { sanitizeFilename } from '../shortcuts/files';
import { sendToLauncher } from './launcher';

export const captureModes = ['new', 'daily'] as const;
export type CaptureMode = typeof captureModes[number];

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

// The paths are passed through the process environment. None are PowerShell code.
export const createSendToLinkScript = String.raw`$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($env:VAULT_SHORTCUTS_LINK)
$shortcut.TargetPath = $env:VAULT_SHORTCUTS_TARGET
$shortcut.Arguments = '//E:JScript //T:20 "' + $env:VAULT_SHORTCUTS_LAUNCHER + '" ' + $env:VAULT_SHORTCUTS_MODE
$shortcut.IconLocation = $env:VAULT_SHORTCUTS_ICON + ',0'
$shortcut.Save()
`;

const exec = promisify(execFile);
// Exact production launcher from the earlier 1.1.0 development build. Links
// keep pointing to the same path, so repair can upgrade just the owned script.
const queueOnlyLauncherHash = '5b8845bd38243d15ccc3eead7b789a1d420af9693017b99508e2e9fa3ac5e43b';

export function sendToLinkName(mode: CaptureMode, vaultName: string): string {
  return `${sanitizeFilename(`Obsidian - ${mode === 'new' ? 'New note' : 'Daily note'} (${vaultName})`)}.lnk`;
}

async function readManagedFile(path: string): Promise<Buffer | undefined> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 16384) throw new Error(`Unexpected file preserved at ${path}.`);
    return await readFile(path);
  } catch (error: unknown) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
    return undefined;
  }
}

export class WindowsSendTo {
  private constructor(readonly directory: string, private readonly vaultName: string, private readonly vaultRoot: string) {}

  static async forVault(root: string, vaultName: string): Promise<WindowsSendTo> {
    const local = process.env.LOCALAPPDATA;
    if (!local || !isAbsolute(local)) throw new Error('Could not find this computer’s local app data folder.');
    const [base, vault] = await Promise.all([realpath(local), realpath(root)]);
    const key = createHash('sha256').update(vault.toLowerCase()).digest('hex');
    const directory = join(base, 'VaultShortcuts', 'SendTo', key);
    const fromVault = relative(vault, directory);
    if (fromVault !== '..' && !fromVault.startsWith('..\\') && !isAbsolute(fromVault)) {
      throw new Error('Windows Send to needs a local data folder outside the vault.');
    }
    return new WindowsSendTo(directory, vaultName, root);
  }

  private async validateDirectory(create = false): Promise<boolean> {
    if (create) await mkdir(this.directory, { recursive: true });
    try {
      if (!(await lstat(this.directory)).isDirectory() ||
          (await realpath(this.directory)).toLowerCase() !== this.directory.toLowerCase()) {
        throw new Error('The Windows Send to data folder cannot be a link.');
      }
      return true;
    } catch (error: unknown) {
      if (!create && hasErrorCode(error, 'ENOENT')) return false;
      throw error;
    }
  }

  async isEnabled(): Promise<boolean> {
    return await this.validateDirectory() && (await readManagedFile(join(this.directory, 'enabled')))?.toString() === '1';
  }

  async install(): Promise<void> {
    const sendTo = await getWindowsSendTo();
    await this.validateDirectory(true);
    const script = join(this.directory, 'send-image.js');
    const vaultPath = encodeURIComponent(this.vaultRoot.replace(/\\/g, '/'));
    await this.writeUnchanged(join(this.directory, 'vault-open-uri'), Buffer.from(`obsidian://open?path=${vaultPath}`));
    await this.installLauncher(script);
    const links: { path: string; content: Buffer; exists: boolean }[] = [];
    for (const mode of captureModes) {
      const path = join(sendTo, sendToLinkName(mode, this.vaultName));
      const reference = join(this.directory, `${mode}.lnk`);
      const existing = await readManagedFile(path);
      let content = await readManagedFile(reference);
      if (existing && !content?.equals(existing)) throw new Error(`Existing Send to entry preserved at ${path}.`);
      if (!content) {
        content = await this.createReference(script, mode);
        await this.writeUnchanged(reference, content);
      }
      links.push({ path, content, exists: existing !== undefined });
    }
    const created: typeof links = [];
    try {
      for (const link of links) {
        if (!link.exists) {
          await writeFile(link.path, link.content, { flag: 'wx' });
          created.push(link);
        }
      }
      await this.writeUnchanged(join(this.directory, 'enabled'), Buffer.from('1'));
    } catch (error: unknown) {
      for (const link of created) await this.removeUnchanged(link.path, link.content);
      throw error;
    }
  }

  private async installLauncher(path: string): Promise<void> {
    const content = Buffer.from(sendToLauncher(), 'utf8');
    const installed = await readManagedFile(path);
    if (!installed || createHash('sha256').update(installed).digest('hex') !== queueOnlyLauncherHash) {
      await this.writeUnchanged(path, content);
      return;
    }
    const stage = join(this.directory, `${randomUUID()}.js.tmp`);
    try {
      await writeFile(stage, content, { flag: 'wx' });
      if (!(await readManagedFile(path))?.equals(installed)) throw new Error(`Existing file preserved at ${path}.`);
      await rename(stage, path);
    } finally {
      await unlink(stage).catch((error: unknown) => { if (!hasErrorCode(error, 'ENOENT')) throw error; });
    }
  }

  async remove(): Promise<string[]> {
    if (!await this.validateDirectory()) return [];
    const sendTo = await getWindowsSendTo();
    await this.removeUnchanged(join(this.directory, 'enabled'), Buffer.from('1'));
    const preserved: string[] = [];
    for (const mode of captureModes) {
      const filename = sendToLinkName(mode, this.vaultName);
      const reference = await readManagedFile(join(this.directory, `${mode}.lnk`));
      if (!await this.removeUnchanged(join(sendTo, filename), reference)) preserved.push(filename);
    }
    return preserved;
  }

  private async createReference(script: string, mode: CaptureMode): Promise<Buffer> {
    const path = join(this.directory, `${randomUUID()}.lnk`);
    const powerShell = windowsPowerShellPath();
    const scriptHost = join(windowsSystemDirectory(), 'wscript.exe');
    try {
      await exec(powerShell, ['-NoProfile', '-NonInteractive', '-Command', createSendToLinkScript], {
        windowsHide: true, timeout: 10000, maxBuffer: 16384,
        env: { ...process.env, VAULT_SHORTCUTS_LINK: path, VAULT_SHORTCUTS_TARGET: scriptHost,
          VAULT_SHORTCUTS_LAUNCHER: script, VAULT_SHORTCUTS_MODE: mode, VAULT_SHORTCUTS_ICON: process.execPath },
      });
      const content = await readManagedFile(path);
      if (!content?.length) throw new Error('Windows did not create the Send to shortcut.');
      return content;
    } finally {
      await unlink(path).catch((error: unknown) => { if (!hasErrorCode(error, 'ENOENT')) throw error; });
    }
  }

  private async writeUnchanged(path: string, content: Buffer): Promise<void> {
    try { await writeFile(path, content, { flag: 'wx' }); }
    catch (error: unknown) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      if (!(await readManagedFile(path))?.equals(content)) throw new Error(`Existing file preserved at ${path}.`);
    }
  }

  private async removeUnchanged(path: string, content: Buffer | undefined): Promise<boolean> {
    const existing = await readManagedFile(path);
    if (!existing) return true;
    if (!content?.equals(existing)) return false;
    await unlink(path);
    return true;
  }
}
