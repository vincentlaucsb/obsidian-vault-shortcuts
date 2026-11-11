import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export const ICON_SIZES = [16, 32, 48, 256] as const;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function validateIconPath(path: string): void {
  if (!/^[a-z]:[\\/]/i.test(path) || !win32.isAbsolute(path) || /["%]/.test(path) ||
      Array.from(path).some(character => character.charCodeAt(0) < 32)) {
    throw new Error('The icon must have an absolute local Windows path without control characters, quotes or percent signs.');
  }
}

export function getIconDirectory(): string {
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error('Windows local application data is unavailable. Choose the standard Obsidian icon.');
  validateIconPath(local);
  return win32.join(local, 'VaultShortcuts', 'Icons');
}

function validatePng(data: Buffer, width: number, height: number): void {
  if (data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
      data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR' ||
      data.readUInt32BE(16) !== width || data.readUInt32BE(20) !== height) {
    throw new Error('The icon contains an invalid PNG image.');
  }
  let offset = 8;
  let hasImage = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (length > data.length - offset - 12) break;
    if (type === 'IDAT') hasImage = true;
    offset += length + 12;
    if (type === 'IEND' && length === 0 && hasImage && offset === data.length) return;
  }
  throw new Error('The icon contains an incomplete PNG image.');
}

export function validateIco(input: Uint8Array): void {
  const data = Buffer.from(input);
  if (data.length < 22 || data.length > MAX_IMAGE_BYTES || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) {
    throw new Error('Choose a valid ICO image smaller than 20 MB.');
  }
  const count = data.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  if (count < 1 || count > 256 || directoryEnd > data.length) throw new Error('The ICO image directory is invalid.');
  const ranges: { start: number; end: number }[] = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const width = data[entry] || 256;
    const height = data[entry + 1] || 256;
    const length = data.readUInt32LE(entry + 8);
    const start = data.readUInt32LE(entry + 12);
    const end = start + length;
    if (length < 12 || start < directoryEnd || end > data.length || data[entry + 3] !== 0 ||
        ranges.some(range => start < range.end && end > range.start)) {
      throw new Error('The ICO image has invalid or overlapping image data.');
    }
    ranges.push({ start, end });
    const image = data.subarray(start, end);
    if (image.subarray(0, 8).equals(PNG_SIGNATURE)) {
      validatePng(image, width, height);
    } else {
      if (image.length < 40 || image.readUInt32LE(0) !== 40 || image.readInt32LE(4) !== width ||
          image.readInt32LE(8) !== height * 2 || image.readUInt16LE(12) !== 1 ||
          ![1, 4, 8, 16, 24, 32].includes(image.readUInt16LE(14)) || image.readUInt32LE(16) !== 0) {
        throw new Error('This ICO uses an unsupported or invalid bitmap. Choose a PNG or JPEG instead.');
      }
      const bits = image.readUInt16LE(14);
      const colors = image.readUInt32LE(32) || (bits <= 8 ? 2 ** bits : 0);
      const required = 40 + colors * 4 + Math.ceil(width * bits / 32) * 4 * height + Math.ceil(width / 32) * 4 * height;
      if (required > image.length) throw new Error('The ICO bitmap is incomplete.');
    }
  }
}

export function createIco(frames: readonly { size: number; png: Uint8Array }[]): Buffer {
  if (!frames.length || frames.length > 256) throw new Error('At least one icon image is required.');
  const images = frames.map(frame => {
    if (!Number.isInteger(frame.size) || frame.size < 1 || frame.size > 256) throw new Error('Invalid icon image size.');
    const png = Buffer.from(frame.png);
    validatePng(png, frame.size, frame.size);
    return { size: frame.size, png };
  });
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    header[entry] = image.size === 256 ? 0 : image.size;
    header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  }
  const result = Buffer.concat([header, ...images.map(image => image.png)]);
  validateIco(result);
  return result;
}

export async function storeIcon(input: Uint8Array, directory = getIconDirectory()): Promise<string> {
  const data = Buffer.from(input);
  validateIco(data);
  if (!isAbsolute(directory)) throw new Error('Icon storage must be an absolute directory.');
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) throw new Error('Icon storage is not a local directory.');
  const destination = join(directory, `${createHash('sha256').update(data).digest('hex')}.ico`);
  const temporary = join(directory, `${randomUUID()}.tmp`);
  await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
  try {
    try { await copyFile(temporary, destination, constants.COPYFILE_EXCL); }
    catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      let matches = false;
      // Another Obsidian process may still be completing its exclusive copy.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (!(await lstat(destination)).isFile()) break;
        if ((await readFile(destination)).equals(data)) { matches = true; break; }
        await setTimeout(25);
      }
      if (!matches) {
        throw new Error('An existing icon asset is damaged. Choose the standard icon or repair local icon storage.');
      }
    }
  } finally { await unlink(temporary); }
  return destination;
}
