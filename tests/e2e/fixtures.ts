import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchObsidian, repository } from './obsidian';
import type { ObsidianHost } from './obsidian';

interface Fixtures { host: ObsidianHost; colorMode: 'dark' | 'light' }
declare global {
  interface Window { fixtureClipboard: { text: string; reads: number; png?: number[]; denied?: boolean } }
}

function installClipboard(): void {
  window.fixtureClipboard = { text: '', reads: 0 };
  const clipboard = navigator.clipboard;
  clipboard.writeText = (text: string): Promise<void> => {
    window.fixtureClipboard.text = text;
    window.fixtureClipboard.png = undefined;
    return Promise.resolve();
  };
  clipboard.read = (): Promise<ClipboardItem[]> => {
    const state = window.fixtureClipboard;
    state.reads++;
    if (state.denied) return Promise.reject(new DOMException('Clipboard access denied by fixture.', 'NotAllowedError'));
    return Promise.resolve(state.png ? [new ClipboardItem({ 'image/png': new Blob([new Uint8Array(state.png)], { type: 'image/png' }) })] : []);
  };
}

export const test = base.extend<Fixtures>({
  colorMode: ['dark', { option: true }],
  host: async ({ colorMode, browserName }, use, info) => {
    if (browserName !== 'chromium') throw new Error('Obsidian requires Chromium.');
    const host = await launchObsidian(colorMode);
    const context = host.page.context();
    try { await host.page.evaluate(installClipboard); await use(host); }
    finally {
      try {
        if (info.status !== info.expectedStatus) {
          for (const [index, page] of context.pages().entries()) {
            const path = info.outputPath(`window-${index}.png`);
            await page.screenshot({ path, timeout: 3000 }).catch(() => {});
            await info.attach(`window-${index}`, { path, contentType: 'image/png' }).catch(() => {});
          }
        }
      } finally { await host.close(info.status !== info.expectedStatus); }
    }
  },
});

export { expect };
export const iconImage = join(repository, 'tests/fixtures/recipes-pot-pie.png');

export async function openSettings(host: ObsidianHost): Promise<Page> {
  const opened = host.page.context().waitForEvent('page');
  await host.page.locator('.workspace-drawer-vault-actions .clickable-icon').last().click();
  const settings = await opened;
  await settings.setViewportSize({ width: 1100, height: 900 });
  await settings.getByText('Vault Shortcuts', { exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Create shortcut with options…', exact: true })).toBeVisible();
  await settings.evaluate(installClipboard);
  return settings;
}

export async function openVaultOptions(settings: Page): Promise<Locator> {
  await settings.getByRole('button', { name: 'Create shortcut with options…', exact: true }).click();
  const modal = settings.locator('.vault-shortcuts-uri-modal');
  await expect(modal).toBeVisible();
  return modal;
}

export async function openFolderOptions(page: Page): Promise<Locator> {
  await page.locator('.nav-folder-title[data-path="Meals"]').click({ button: 'right' });
  await page.getByText('Create folder shortcut…', { exact: true }).click();
  const modal = page.locator('.vault-shortcuts-uri-modal');
  await expect(modal).toBeVisible();
  return modal;
}

export async function openFileOptions(page: Page, path = 'Meals/Comfort soup.md'): Promise<Locator> {
  const title = page.locator(`.nav-folder-title[data-path="${path.split('/')[0]}"]`);
  const file = page.locator(`.nav-file-title[data-path="${path}"]`);
  if (!await file.isVisible()) await title.locator('.collapse-icon').click();
  await file.click({ button: 'right' });
  await page.getByText('Create shortcut with options…', { exact: true }).click();
  const modal = page.locator('.vault-shortcuts-uri-modal');
  await expect(modal).toBeVisible();
  return modal;
}

export async function preview(modal: Locator): Promise<URL> {
  return new URL(await modal.getByRole('textbox', { name: 'URI preview' }).inputValue());
}

export async function chooseImage(page: Page, control: Locator): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await control.getByRole('button', { name: 'Choose image…', exact: true }).click();
  await (await chooser).setFiles(iconImage);
  await expect(control.locator('img')).toBeVisible();
}

export async function seedClipboardImage(page: Page): Promise<void> {
  const bytes = [...await readFile(iconImage)];
  await page.evaluate(png => { window.fixtureClipboard.png = png; window.fixtureClipboard.text = ''; }, bytes);
}
