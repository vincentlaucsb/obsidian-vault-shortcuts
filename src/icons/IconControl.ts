import { Notice, Setting } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
import { readIcon } from './assets';
import { iconPlatform, prepareImageIcon, resolveIconPath, storePreparedIcon } from './image';
import type { IconSelection, ImageSource } from './image';

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

export function addIconControl(
  container: HTMLElement, initial: IconSelection,
  changed: (selection: IconSelection) => Promise<void>,
  defaultPath?: string, allowDefault = true, allowStandard = true,
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
    const path = resolveIconPath(selection, defaultPath);
    preview.hidden = true;
    status.setText(path ? 'Custom icon' : 'Obsidian icon');
    if (!path) return;
    try {
      const bytes = await readIcon(path, platform);
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
      const path = await storePreparedIcon(await prepareImageIcon(file, workspace, platform), platform);
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
  if (allowStandard) setting.addButton(button => { buttons.push(button); button.setButtonText('Use Obsidian icon').onClick(() => { reset({ mode: 'standard' }); }); });
  void showPreview();
  return () => busy;
}
