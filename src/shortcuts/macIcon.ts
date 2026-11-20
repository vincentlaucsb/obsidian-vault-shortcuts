import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { readIcon, validatePosixIconPath } from '../icons/assets';
import { macIconArguments } from './macIconBridge';
import { ShortcutIconError } from './IShortcutCreator';

/** Apply only to a new, exclusively created shortcut; existing files are untouched. */
export async function createMacShortcutWithIcon(create: () => Promise<string>, iconPath?: string): Promise<string> {
  if (iconPath === undefined) return create();
  await readIcon(iconPath, 'macos');
  await access('/usr/bin/osascript', constants.X_OK);
  const destination = await create();
  validatePosixIconPath(destination);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile('/usr/bin/osascript', macIconArguments(iconPath, destination), {
        windowsHide: true, timeout: 10000, maxBuffer: 16384,
      }, error => { if (error) reject(error instanceof Error ? error : new Error('The macOS icon helper failed.')); else resolve(); });
      child.stdin?.on('error', () => { /* The process callback reports failures. */ });
      child.stdin?.end();
    });
  } catch (error: unknown) {
    throw new ShortcutIconError(destination, error instanceof Error ? error.message : String(error));
  }
  return destination;
}
