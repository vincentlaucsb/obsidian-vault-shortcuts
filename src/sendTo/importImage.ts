import { lstat, open, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, posix, relative, win32 } from 'node:path';
import type { App, TFile } from 'obsidian';
import { sanitizeFilename } from '../shortcuts/files';
import { cliOutputLines, findObsidianCli, runVaultCommand } from '../vaultDiscovery';
import { hasErrorCode } from './windows';
import type { CaptureMode } from './windows';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const imageSignatures = new Map<string, (bytes: Buffer) => boolean>([
  ['.png', bytes => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  ['.jpg', jpegSignature],
  ['.jpeg', jpegSignature],
  ['.gif', bytes => ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))],
  ['.webp', bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'],
  ['.bmp', bytes => bytes.toString('ascii', 0, 2) === 'BM'],
]);

function jpegSignature(bytes: Buffer): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export interface ImageRequest { mode: CaptureMode; source: string }

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32);
}

export function readImageRequest(value: unknown): ImageRequest {
  if (typeof value !== 'object' || value === null || !('mode' in value) || !('source' in value) ||
      (value.mode !== 'new' && value.mode !== 'daily') || typeof value.source !== 'string' ||
      !/^[a-z]:[\\/]/i.test(value.source) || value.source.slice(2).includes(':') || hasControlCharacters(value.source)) {
    throw new Error('Select a local image file in File Explorer.');
  }
  return { mode: value.mode, source: win32.normalize(value.source) };
}

async function readImage(source: string): Promise<{ title: string; extension: string; bytes: ArrayBuffer }> {
  const extension = extname(source).toLowerCase();
  const matchesFormat = imageSignatures.get(extension);
  if (!matchesFormat) throw new Error('Choose a PNG, JPEG, GIF, WebP or BMP image.');
  if (!(await lstat(source)).isFile()) throw new Error('Select a regular image file.');
  const file = await open(source, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 12 || info.size > MAX_IMAGE_BYTES) {
      throw new Error('Choose a valid image up to 32 MB.');
    }
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error('The image changed while it was being read. Try again.');
      offset += bytesRead;
    }
    if (!matchesFormat(bytes)) throw new Error('The image data does not match its file extension.');
    const title = sanitizeFilename(basename(source, extname(source)).replace(/[#[\]^%]/g, '-'));
    return { title, extension, bytes: Uint8Array.from(bytes).buffer };
  } finally { await file.close(); }
}

export function readCaptureFolder(value: string): string {
  const input = value.trim().replace(/\\/g, '/');
  if (!input || input === '/') return '';
  const folder = input.replace(/\/+$/, '');
  if (hasControlCharacters(folder) || folder.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part))) {
    throw new Error('Enter a folder path relative to this vault, or leave it blank for the vault root.');
  }
  return folder;
}

function insideVault(root: string, path: string): boolean {
  const difference = relative(root, path);
  return difference !== '..' && !difference.startsWith('..\\') && !isAbsolute(difference);
}

async function assertVaultLocation(root: string, path: string, mayCreate = false): Promise<void> {
  const nativePath = join(root, path);
  try {
    if (!insideVault(root, await realpath(nativePath))) throw new Error('The destination must be inside this vault.');
  } catch (error: unknown) {
    if (!mayCreate || !path || path === '.' || !hasErrorCode(error, 'ENOENT')) throw error;
    try { await lstat(nativePath); }
    catch (statError: unknown) {
      if (!hasErrorCode(statError, 'ENOENT')) throw statError;
      await assertVaultLocation(root, posix.dirname(path), true);
      return;
    }
    throw new Error('The note path contains a broken filesystem link.');
  }
}

function cliPath(output: string): string {
  const lines = cliOutputLines(output);
  if (lines.length !== 1 || !lines[0]) throw new Error('Obsidian did not return a path.');
  return lines[0];
}

async function getDailyNote(app: App, root: string): Promise<TFile> {
  try {
    const cli = await findObsidianCli(true);
    const target = `vault=${app.vault.getName()}`;
    const reported = cliPath(await runVaultCommand(cli, [target, 'vault', 'info=path']));
    if (!isAbsolute(reported) || (await realpath(reported)).toLowerCase() !== root.toLowerCase()) {
      throw new Error('The CLI selected a different vault. Use a distinct vault name.');
    }
    const path = cliPath(await runVaultCommand(cli, [target, 'daily:path']));
    if (isAbsolute(path) && !insideVault(root, path)) throw new Error('The daily note must be inside this vault.');
    const filePath = (isAbsolute(path) ? relative(root, path) : path).replace(/\\/g, '/');
    if (!filePath.endsWith('.md') || readCaptureFolder(filePath) !== filePath) throw new Error('Invalid daily note path.');
    if (!app.vault.getFileByPath(filePath)) {
      await assertVaultLocation(root, filePath, true);
      await runVaultCommand(cli, [target, 'daily']);
    }
    const daily = app.vault.getFileByPath(filePath);
    if (!daily) throw new Error('Obsidian did not create today’s note.');
    await assertVaultLocation(root, daily.path);
    return daily;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    throw new Error(`Could not find today’s note. Enable Daily notes and the command line interface in Obsidian settings. ${message}`);
  }
}

async function availablePath(app: App, root: string, folder: string, title: string, extension: string): Promise<string> {
  for (let index = 1; index <= 999; index++) {
    const path = `${folder ? `${folder}/` : ''}${title}${index === 1 ? '' : ` (${index})`}${extension}`;
    if (app.vault.getAbstractFileByPath(path)) continue;
    // lstat also treats a dangling filesystem link as an occupied filename.
    try { await lstat(join(root, path)); }
    catch (error: unknown) { if (hasErrorCode(error, 'ENOENT')) return path; throw error; }
  }
  throw new Error('Too many files share this image’s name. Rename the original and try again.');
}

export async function importImage(app: App, vaultRoot: string, newFolder: string, request: ImageRequest): Promise<TFile> {
  const root = await realpath(vaultRoot);
  const image = await readImage(request.source).catch((error: unknown) => {
    if (hasErrorCode(error, 'ENOENT')) throw new Error('The selected image is no longer at its original location.');
    throw error;
  });
  const daily = request.mode === 'daily' ? await getDailyNote(app, root) : undefined;
  const folder = daily ? daily.path.split('/').slice(0, -1).join('/') : newFolder;
  if (folder && !app.vault.getFolderByPath(folder)) throw new Error('The capture folder is missing. Update it in Vault Shortcuts settings.');
  await assertVaultLocation(root, folder);
  const notePath = daily?.path ?? await availablePath(app, root, folder, image.title, '.md');
  const attachmentPath = await availablePath(app, root, folder, image.title, image.extension);
  const attachment = await app.vault.createBinary(attachmentPath, image.bytes);
  let note: TFile;
  try {
    const link = app.fileManager.generateMarkdownLink(attachment, notePath);
    const embed = link.startsWith('!') ? link : `!${link}`;
    if (daily) {
      await app.vault.process(daily, content => `${content}${content ? content.endsWith('\n') ? '\n' : '\n\n' : ''}${embed}\n`);
      note = daily;
    } else note = await app.vault.create(notePath, `${embed}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    throw new Error(`The image was copied to ${attachment.path}, but the note could not be written. ${message}`);
  }
  return note;
}
