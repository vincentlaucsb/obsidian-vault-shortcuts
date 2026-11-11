import { Notice, Setting } from 'obsidian';
import { readFile, stat } from 'node:fs/promises';
import { createIco, ICON_SIZES, MAX_IMAGE_BYTES, storeIcon, validateIco, validateIconPath } from './icons';

export type IconSelection = { mode: 'default' } | { mode: 'standard' } | { mode: 'custom'; path: string };

export async function readIcon(path: string): Promise<Buffer> {
  validateIconPath(path);
  if ((await stat(path)).size > MAX_IMAGE_BYTES) throw new Error('Icon file is too large. Choose another image.');
  const data = await readFile(path);
  validateIco(data);
  return data;
}

async function importImage(file: File): Promise<string> {
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
  const image = createEl('img');
  image.src = `data:image/${ico ? 'x-icon' : png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  try { await image.decode(); }
  catch { throw new Error('Could not decode this image. Choose another PNG, JPEG or ICO.'); }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) {
    throw new Error('Choose an image with at most 40 million pixels.');
  }
  if (ico) return storeIcon(bytes);
  const frames = ICON_SIZES.map(size => {
    const canvas = createEl('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable. Try an ICO file.');
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return { size, png: Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64') };
  });
  return storeIcon(createIco(frames));
}

export function addIconControl(
  container: HTMLElement, initial: IconSelection,
  changed: (selection: IconSelection) => Promise<void>,
  defaultPath?: string, allowDefault = true,
): () => boolean {
  let selection = initial;
  let busy = false;
  let revision = 0;
  const setting = new Setting(container).setName('Shortcut icon');
  const preview = setting.controlEl.createEl('img', { cls: 'vault-shortcuts-icon-preview', attr: { alt: 'Selected shortcut icon' } });
  const status = container.createEl('p', { cls: 'vault-shortcuts-icon-status' });
  const showPreview = async (): Promise<void> => {
    const current = ++revision;
    const path = selection.mode === 'custom' ? selection.path : selection.mode === 'default' ? defaultPath : undefined;
    preview.hidden = true;
    status.setText(path ? 'Custom icon' : 'Obsidian icon');
    if (!path) return;
    try {
      const bytes = await readIcon(path);
      if (revision !== current || !container.isConnected) return;
      preview.src = `data:image/x-icon;base64,${bytes.toString('base64')}`;
      preview.hidden = false;
    } catch {
      if (revision === current && container.isConnected) status.setText('Icon unavailable on this computer. Choose an image or use the Obsidian icon.');
    }
  };
  const apply = async (next: IconSelection): Promise<void> => {
    await changed(next);
    selection = next;
    await showPreview();
  };
  setting.addButton(button => button.setButtonText('Choose image…').onClick(() => {
    if (busy) return;
    const input = createEl('input');
    input.type = 'file'; input.accept = '.png,.jpg,.jpeg,.ico';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !container.isConnected) return;
      busy = true; button.setDisabled(true);
      void importImage(file).then(async path => {
        if (container.isConnected) await apply({ mode: 'custom', path });
      }).catch((error: unknown) => {
        if (container.isConnected) new Notice(`Could not import icon: ${error instanceof Error ? error.message : String(error)}`);
      }).finally(() => { busy = false; button.setDisabled(false); });
    };
    input.click();
  }));
  const reset = (next: IconSelection): void => {
    if (busy) return;
    busy = true;
    void apply(next).catch(() => { new Notice('Could not save icon selection. Please try again.'); })
      .finally(() => { busy = false; });
  };
  if (allowDefault) setting.addButton(button => button.setButtonText('Use default').onClick(() => { reset({ mode: 'default' }); }));
  setting.addButton(button => button.setButtonText('Use Obsidian icon').onClick(() => { reset({ mode: 'standard' }); }));
  void showPreview();
  return () => busy;
}
