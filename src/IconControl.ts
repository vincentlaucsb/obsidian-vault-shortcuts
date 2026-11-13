import { Notice, Platform, Setting } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
import { readFile, stat } from 'node:fs/promises';
import { createIco, ICON_SIZES, MAX_IMAGE_BYTES, PNG_ICON_SIZE, storeIcon, storePngIcon, validateIco, validateIconPath, validatePngIcon, validatePosixIconPath } from './icons';
import type { IconPlatform } from './icons';

export type IconSelection = { mode: 'default' } | { mode: 'standard' } | { mode: 'custom'; path: string };

interface ImageSource {
  readonly name: string;
  readonly size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

async function clipboardImage(container: HTMLElement): Promise<ImageSource> {
  const clipboard = container.ownerDocument.defaultView?.navigator.clipboard;
  if (!clipboard || typeof clipboard.read !== 'function') {
    throw new Error('Image paste is unavailable in this window. Choose an image file instead.');
  }
  let items: ClipboardItems;
  try { items = await clipboard.read(); }
  catch { throw new Error('Clipboard access was denied or unavailable. Copy an image and retry, or choose an image file.'); }
  for (const item of items) {
    for (const [type, extension] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/x-icon', 'ico'], ['image/vnd.microsoft.icon', 'ico']] as const) {
      if (!item.types.includes(type)) continue;
      const image = await item.getType(type);
      return { name: `Clipboard.${extension}`, size: image.size, arrayBuffer: () => image.arrayBuffer() };
    }
  }
  throw new Error('The clipboard has no supported image. Copy an image, then try again.');
}

function iconPlatform(): IconPlatform {
  return Platform.isWin ? 'windows' : Platform.isMacOS ? 'macos' : 'linux';
}

export async function readIcon(path: string): Promise<Buffer> {
  const windows = Platform.isWin;
  if (windows) validateIconPath(path);
  else validatePosixIconPath(path);
  if ((await stat(path)).size > MAX_IMAGE_BYTES) throw new Error('Icon file is too large. Choose another image.');
  const data = await readFile(path);
  if (windows) validateIco(data);
  else validatePngIcon(data);
  return data;
}

async function importImage(file: ImageSource, workspace: HTMLElement, platform: IconPlatform): Promise<string> {
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
  if (ico && platform === 'windows') return storeIcon(bytes);
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
  return platform === 'windows' ? storeIcon(createIco(frames)) : storePngIcon(frames[0].png, platform);
}

export function addIconControl(
  container: HTMLElement, initial: IconSelection,
  changed: (selection: IconSelection) => Promise<void>,
  defaultPath?: string, allowDefault = true,
): () => boolean {
  let selection = initial;
  let busy = false;
  let revision = 0;
  const buttons: ButtonComponent[] = [];
  const setBusy = (value: boolean): void => {
    busy = value;
    if (container.isConnected) for (const button of buttons) button.setDisabled(value);
  };
  const platform = iconPlatform();
  const setting = new Setting(container).setName('Shortcut icon').setClass('vault-shortcuts-icon-control');
  // The input must belong to the window receiving the user's click. Global
  // createEl can use the main vault document when Settings is in a popout.
  const input = setting.controlEl.createEl('input', { type: 'file', attr: { accept: '.png,.jpg,.jpeg,.ico' } });
  input.hidden = true;
  const preview = setting.controlEl.createEl('img', { cls: 'vault-shortcuts-icon-preview', attr: { alt: 'Selected shortcut icon' } });
  const status = container.createEl('p', { cls: 'vault-shortcuts-icon-status' });
  const showPreview = async (): Promise<void> => {
    if (!container.isConnected) return;
    const current = ++revision;
    const path = selection.mode === 'custom' ? selection.path : selection.mode === 'default' ? defaultPath : undefined;
    preview.hidden = true;
    status.setText(path ? 'Custom icon' : 'Obsidian icon');
    if (!path) return;
    try {
      const bytes = await readIcon(path);
      if (revision !== current || !container.isConnected) return;
      preview.src = `data:image/${platform === 'windows' ? 'x-icon' : 'png'};base64,${bytes.toString('base64')}`;
      preview.hidden = false;
    } catch {
      if (revision === current && container.isConnected) status.setText('Icon unavailable on this computer. Choose an image or use the Obsidian icon.');
    }
  };
  const apply = async (next: IconSelection): Promise<void> => {
    await changed(next);
    if (!container.isConnected) return;
    selection = next;
    await showPreview();
  };
  const importSelected = async (source: () => Promise<ImageSource>, action: 'import' | 'paste'): Promise<void> => {
    if (busy || !container.isConnected) return;
    setBusy(true);
    const workspace = container.createDiv();
    workspace.hidden = true;
    try {
      // Call source immediately, before yielding, to preserve the Paste click's
      // user activation. Clipboard reads use this control's owning window.
      const file = await source();
      if (!container.isConnected) return;
      const path = await importImage(file, workspace, platform);
      if (container.isConnected) await apply({ mode: 'custom', path });
    } catch (error: unknown) {
      if (container.isConnected) new Notice(`Could not ${action} icon: ${error instanceof Error ? error.message : String(error)}`);
    } finally { workspace.remove(); setBusy(false); }
  };
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void importSelected(() => Promise.resolve(file), 'import');
  };
  setting.addButton(button => { buttons.push(button); button.setButtonText('Choose image…').onClick(() => {
    if (busy || !container.isConnected) return;
    input.value = '';
    try { input.click(); }
    catch (error: unknown) {
      new Notice(`Could not open image picker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }); });
  setting.addButton(button => {
    buttons.push(button);
    button.setButtonText('Paste image').onClick(async () => { await importSelected(() => clipboardImage(container), 'paste'); });
  });
  const reset = (next: IconSelection): void => {
    if (busy || !container.isConnected) return;
    setBusy(true);
    void apply(next).catch(() => { new Notice('Could not save icon selection. Please try again.'); })
      .finally(() => { setBusy(false); });
  };
  if (allowDefault) setting.addButton(button => { buttons.push(button); button.setButtonText('Use default').onClick(() => { reset({ mode: 'default' }); }); });
  setting.addButton(button => { buttons.push(button); button.setButtonText('Use Obsidian icon').onClick(() => { reset({ mode: 'standard' }); }); });
  void showPreview();
  return () => busy;
}
