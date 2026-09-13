import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { buildObsidianUri } from './uri';

export function sanitizeFilename(label: string): string {
  let safe = Array.from(label, character => character.charCodeAt(0) < 32 ? '-' : character)
    .join('').replace(/[<>:"/\\|?*]/g, '-').trim().replace(/[. ]+$/g, '');
  // Leave room for the suffix and extension under byte-based filename limits.
  let shortened = '';
  for (const character of safe) {
    if (Buffer.byteLength(shortened + character, 'utf8') > 180) break;
    shortened += character;
  }
  safe = shortened.replace(/[. ]+$/g, '');
  if (!safe) safe = 'Obsidian shortcut';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe;
}

export function shortcutLabel(vaultName: string, notePath?: string): string {
  return notePath === undefined ? `${vaultName} - Obsidian` :
    `${notePath.split('/').pop()?.replace(/\.md$/i, '') ?? 'Note'} - ${vaultName}`;
}

export function serializeUrl(uri: string): string {
  return `[InternetShortcut]\r\nURL=${uri}\r\n`;
}

export function serializeDesktopLink(label: string, uri: string): string {
  // Desktop Entry string escapes; URL is percent-encoded, not an Exec field.
  const name = label.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/ /g, '\\s');
  return `[Desktop Entry]\nType=Link\nName=${name}\nURL=${uri}\nIcon=obsidian\n`;
}

export async function writeShortcut(
  desktop: string, format: 'url' | 'desktop', vaultName: string, notePath?: string,
): Promise<string> {
  if (!isAbsolute(desktop)) throw new Error('Desktop must be an absolute path.');
  const label = shortcutLabel(vaultName, notePath);
  const uri = buildObsidianUri(vaultName, notePath);
  const content = format === 'url' ? serializeUrl(uri) : serializeDesktopLink(label, uri);
  return writeShortcutContent(desktop, format, label, content);
}

export async function writeShortcutContent(
  directory: string, extension: 'url' | 'desktop' | 'lnk', label: string, content: string | Uint8Array,
): Promise<string> {
  if (!isAbsolute(directory)) throw new Error('Shortcut destination must be an absolute path.');
  const base = sanitizeFilename(label);
  for (let index = 1; index <= 999; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const destination = join(directory, `${base}${suffix}.${extension}`);
    try {
      // wx preserves existing files, including concurrent calls and symlinks.
      await writeFile(destination, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      return destination;
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  }
  throw new Error('Too many shortcuts with this name. Rename or remove one first.');
}
