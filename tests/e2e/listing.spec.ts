import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import { test, expect, chooseImage, openSettings, openVaultOptions, openFolderOptions, openFileOptions, preview } from './fixtures';
import { repository } from './obsidian';

for (const colorMode of ['dark', 'light'] as const) {
  test.describe(`${colorMode} listing`, () => {
    test.use({ colorMode });
    test('capture fictional recipe workflows @listing', async ({ host }) => {
      const output = join(repository, 'docs/images/listing');
      await mkdir(output, { recursive: true });
      const capture = async (element: Locator, name: string): Promise<void> => {
        await element.page().mouse.move(0, 0);
        await element.screenshot({ path: join(output, `${name}-${colorMode}.png`), animations: 'disabled', caret: 'hide', scale: 'css' });
      };
      const settings = await openSettings(host);
      await expect(settings.locator('body')).toHaveClass(new RegExp(`theme-${colorMode}`));
      await chooseImage(settings, settings.locator('.vault-shortcuts-settings-icon'));
      await capture(settings.locator('.vertical-tab-content'), 'settings');
      const options = await openVaultOptions(settings);
      await options.locator('[data-uri-field="label"]').fill('Recipe Box');
      await options.getByRole('radio', { name: 'Custom image', exact: true }).check();
      await chooseImage(settings, options);
      await expect(options.getByRole('button', { name: 'Create shortcut', exact: true })).toBeEnabled();
      await capture(options, 'custom-icon');
      await options.getByRole('button', { name: 'Cancel', exact: true }).click();
      await settings.close();
      await host.page.setViewportSize({ width: 1180, height: 1480 });
      const folder = await openFolderOptions(host.page);
      await folder.getByRole('tab', { name: 'Advanced', exact: true }).click();
      expect((await preview(folder)).searchParams.get('file')).toBe('Meals/Untitled.md');
      await capture(folder, 'folder');
      await folder.getByRole('button', { name: 'Cancel', exact: true }).click();
      const note = await openFileOptions(host.page);
      await note.getByRole('tab', { name: 'Advanced', exact: true }).click();
      await note.locator('[data-uri-field="navigation"]').selectOption('heading');
      await note.locator('[data-uri-field="anchor"]').fill('Ingredients');
      expect((await preview(note)).searchParams.get('file')).toBe('Meals/Comfort soup.md#Ingredients');
      await capture(note, 'note');
    });
  });
}
