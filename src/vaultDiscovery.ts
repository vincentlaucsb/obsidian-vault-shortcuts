import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, posix, win32 } from 'node:path';

export const CLI_SETUP_HELP = 'Go to Settings → General → Command line interface, enable it, ' +
  'and follow the prompt to register the CLI on PATH. Use Obsidian installer 1.12.7 or newer. ' +
  'Restart Obsidian after changing PATH, then retry. You can also enter a vault name manually below.';

class DiscoveryError extends Error {
  constructor(readonly reason: 'missing' | 'timeout' | 'response' | 'launch') { super(reason); }
}

export function discoveryErrorMessage(error: unknown): string {
  if (error instanceof DiscoveryError) {
    if (error.reason === 'missing') return `The Obsidian CLI was not found on PATH or beside the running app. ${CLI_SETUP_HELP}`;
    if (error.reason === 'timeout') return 'The Obsidian CLI did not finish within 10 seconds. Retry, or update the Obsidian installer for improved CLI support. You can still enter a vault name manually.';
    if (error.reason === 'response') return 'The Obsidian CLI ran but did not return a recognizable vault list. Check that the CLI is enabled in Settings → General and try updating the Obsidian installer. You can still enter a vault name manually.';
  }
  return `The Obsidian CLI could not complete the vault-list command. ${CLI_SETUP_HELP}`;
}

export function parseVaultNames(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\d{4}-\d{2}-\d{2} .* Loading (?:updated )?app package /.test(line) ||
      line.startsWith('Your Obsidian installer is out of date.') || line === 'https://obsidian.md/download') continue;
    const fields = line.split('\t');
    const [name, path] = fields;
    if (fields.length !== 2 || !name?.trim() || !path ||
      !(win32.isAbsolute(path) || posix.isAbsolute(path)) ||
      Array.from(name + path).some(char => char.charCodeAt(0) < 32)) throw new DiscoveryError('response');
    names.push(name);
  }
  if (!names.length) throw new DiscoveryError('response');
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export function runVaultCommand(executable: string, args: string[] = ['vaults', 'verbose'], timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, {
      windowsHide: true, timeout, maxBuffer: 262144, encoding: 'utf8',
    }, (error, stdout) => {
      if (error) reject(new DiscoveryError(error.killed ? 'timeout' : 'launch'));
      else resolve(stdout);
    });
    // Older Windows CLI hosts wait for stdin/console input. Explicit EOF lets
    // them finish without a user pressing Enter; no shell or interactive TUI.
    child.stdin?.on('error', () => { /* Process callback reports launch failures. */ });
    child.stdin?.end();
  });
}

export async function discoverVaults(windows: boolean): Promise<string[]> {
  const candidates: string[] = [];
  // Prefer the CLI redirector beside the running Windows app, then its executable
  // for older installers. This also works when Obsidian inherited a stale PATH.
  if (windows && basename(process.execPath).toLowerCase() === 'obsidian.exe') {
    candidates.push(join(dirname(process.execPath), 'Obsidian.com'), process.execPath);
  }
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    const directory = entry.replace(/^"|"$/g, '');
    if (!isAbsolute(directory)) continue;
    for (const name of windows ? ['Obsidian.com', 'Obsidian.exe'] : ['obsidian']) candidates.push(join(directory, name));
  }
  for (const candidate of candidates) {
    try { await access(candidate, windows ? constants.F_OK : constants.X_OK); }
    catch { continue; }
    return parseVaultNames(await runVaultCommand(candidate));
  }
  throw new DiscoveryError('missing');
}
