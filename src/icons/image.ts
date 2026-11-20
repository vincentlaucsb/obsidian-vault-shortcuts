import { Platform } from 'obsidian';
import { createIco, ICON_SIZES, MAX_IMAGE_BYTES, PNG_ICON_SIZE, storeIcon, storePngIcon, validateIco } from './assets';
import type { IconPlatform } from './assets';

export type IconSelection = { mode: 'default' } | { mode: 'standard' } | { mode: 'custom'; path: string };

export interface ImageSource {
  readonly name: string;
  readonly size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export function resolveIconPath(selection: IconSelection, defaultPath?: string): string | undefined {
  return selection.mode === 'custom' ? selection.path : selection.mode === 'default' ? defaultPath : undefined;
}

export function iconPlatform(): IconPlatform {
  return Platform.isWin ? 'windows' : Platform.isMacOS ? 'macos' : 'linux';
}

export async function prepareImageIcon(file: ImageSource, workspace: HTMLElement, platform: IconPlatform): Promise<Buffer> {
  if (!/\.(png|jpe?g|ico)$/i.test(file.name)) throw new Error('Choose a PNG, JPEG or ICO image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 20 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ico = /\.ico$/i.test(file.name);
  if (ico) validateIco(bytes);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!ico && !png && !jpeg) throw new Error('This file is not a valid PNG or JPEG image.');
  if (png && bytes.length >= 24 && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40_000_000) {
    throw new Error('Choose an image with at most 40 million pixels.');
  }
  const image = workspace.createEl('img');
  image.src = `data:image/${ico ? 'x-icon' : png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  try { await image.decode(); }
  catch { throw new Error('Could not decode this image. Choose another PNG, JPEG or ICO.'); }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) {
    throw new Error('Choose an image with at most 40 million pixels.');
  }
  if (ico && platform === 'windows') return bytes;
  const frames = (platform === 'windows' ? ICON_SIZES : [PNG_ICON_SIZE]).map(size => {
    const canvas = workspace.createEl('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable. Try an ICO file.');
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return { size, png: Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64') };
  });
  return platform === 'windows' ? createIco(frames) : frames[0].png;
}

export async function storePreparedIcon(bytes: Buffer, platform: IconPlatform): Promise<string> {
  return platform === 'windows' ? storeIcon(bytes) : storePngIcon(bytes, platform);
}
