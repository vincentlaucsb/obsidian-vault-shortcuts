import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { buildObsidianUri, buildTagSearchUri } from './uri';
import type { ShortcutOptions } from './IShortcutCreator';
import { validateIconPath } from '../icons';
import { buildShortcutUri } from './requests';
import type { ShortcutContext, ShortcutRequest } from './requests';

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

export function serializeUrl(uri: string, options?: ShortcutOptions): string {
  if (options?.iconPath !== undefined) validateIconPath(options.iconPath);
  const icon = options?.iconPath === undefined ? '' : `IconFile=${options.iconPath}\r\nIconIndex=0\r\n`;
  return `[InternetShortcut]\r\nURL=${uri}\r\n${icon}`;
}

export function serializeDesktopLink(label: string, uri: string): string {
  // Desktop Entry string escapes; URL is percent-encoded, not an Exec field.
  const name = label.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/ /g, '\\s');
  return `[Desktop Entry]\nType=Link\nName=${name}\nURL=${uri}\nIcon=obsidian\n`;
}

export async function writeShortcut(
  desktop: string, format: 'url' | 'desktop', vaultName: string, notePath?: string, options?: ShortcutOptions,
): Promise<string> {
  if (!isAbsolute(desktop)) throw new Error('Desktop must be an absolute path.');
  const label = shortcutLabel(vaultName, notePath);
  const uri = buildObsidianUri(vaultName, notePath);
  const content = format === 'url' ? serializeUrl(uri, options) : serializeDesktopLink(label, uri);
  return writeShortcutContent(desktop, format, label, content, format === 'url' && options?.iconPath !== undefined);
}

export async function writeRequestShortcut(
  directory: string, format: 'url' | 'desktop', request: ShortcutRequest, label: string,
  options?: ShortcutOptions, context?: ShortcutContext,
): Promise<string> {
  if (!label.trim()) throw new Error('Enter a shortcut name.');
  const uri = buildShortcutUri(request, context);
  const content = format === 'url' ? serializeUrl(uri, options) : serializeDesktopLink(label, uri);
  return writeShortcutContent(directory, format, label, content, format === 'url' && options?.iconPath !== undefined);
}

export async function writeShortcutContent(
  directory: string, extension: 'url' | 'desktop', label: string, content: string, windowsUnicode = false,
): Promise<string> {
  if (!isAbsolute(directory)) throw new Error('Shortcut destination must be an absolute path.');
  const base = sanitizeFilename(label);
  for (let index = 1; index <= 999; index++) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const destination = join(directory, `${base}${suffix}.${extension}`);
    try {
      // wx preserves existing files, including concurrent calls and symlinks.
      // Windows InternetShortcut reads native icon paths using INI encoding rules.
      // A UTF-16LE BOM preserves Unicode paths outside the active ANSI code page.
      const data = windowsUnicode ? Buffer.from(`\uFEFF${content}`, 'utf16le') : Buffer.from(content, 'utf8');
      await writeFile(destination, data, { flag: 'wx', mode: 0o600 });
      return destination;
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  }
  throw new Error('Too many shortcuts with this name. Rename or remove one first.');
}

export async function writeTagShortcut(
  directory: string, format: 'url' | 'desktop', vaultName: string, tag: string, options?: ShortcutOptions,
): Promise<string> {
  const label = `${vaultName} - Tag ${tag.slice(1)}`;
  const uri = buildTagSearchUri(vaultName, tag);
  const content = format === 'url' ? serializeUrl(uri, options) : serializeDesktopLink(label, uri);
  return writeShortcutContent(directory, format, label, content, format === 'url' && options?.iconPath !== undefined);
}
