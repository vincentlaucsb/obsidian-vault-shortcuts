import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function queryDesktop(executable: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(executable, args, {
    windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
  });
  return stdout.replace(/[\r\n]+$/, '');
}

export async function validateDesktop(desktop: string, home?: string, label = 'Desktop'): Promise<string> {
  if (!desktop || !isAbsolute(desktop) || (home !== undefined && resolve(desktop) === resolve(home))) {
    throw new Error(`No ${label} folder is configured.`);
  }
  if (!(await stat(desktop)).isDirectory()) throw new Error(`The ${label} path is not a folder.`);
  return desktop;
}

export function windowsPowerShellPath(): string {
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) throw new Error('Cannot locate Windows PowerShell.');
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export function getWindowsDesktop(): Promise<string> {
  return getWindowsFolder('DesktopDirectory');
}

export function getWindowsStartMenu(): Promise<string> {
  return getWindowsFolder('Programs');
}

async function getWindowsFolder(folder: 'DesktopDirectory' | 'Programs'): Promise<string> {
  // Fixed code only: no vault names, note paths or URLs are interpolated.
  const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
    `[Environment]::GetFolderPath([Environment+SpecialFolder]::${folder})`;
  return validateDesktop(await queryDesktop(
    windowsPowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-Command', script],
  ), undefined, folder === 'Programs' ? 'Start menu Programs' : 'Desktop');
}

export async function getMacOSDesktop(): Promise<string> {
  return validateDesktop(await queryDesktop('/usr/bin/osascript',
    ['-e', 'POSIX path of (path to desktop folder)']));
}

export async function getLinuxDesktop(): Promise<string> {
  return validateDesktop(await queryDesktop('xdg-user-dir', ['DESKTOP']), homedir());
}
