import { test, expect, chooseImage, openFileOptions, openFolderOptions, openSettings, openVaultOptions, preview, seedClipboardImage } from './fixtures';

test('native destination queries are blocked before plugin imports and cannot create a real Desktop shortcut', async ({ host }) => {
  const settings = await openSettings(host);
  const calls = await host.page.evaluate(() => window.fixtureBlockedProcesses.length);
  await settings.getByRole('button', { name: 'Create shortcut', exact: true }).click();
  await expect(settings.locator('.notice')).toContainText('Could not create shortcut');
  expect(await host.page.evaluate(() => window.fixtureBlockedProcesses.length)).toBe(calls + 1);
});

test('detached settings keep descriptions above wrapping button rows at narrow widths', async ({ host }) => {
  const settings = await openSettings(host);
  await settings.setViewportSize({ width: 650, height: 900 });
  const content = settings.locator('.vertical-tab-content');
  await expect(content.getByText('Create vault shortcut', { exact: true })).toBeVisible();
  const rows = content.locator('.vault-shortcuts-stacked-setting');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    const description = await row.locator(':scope > .setting-item-info').boundingBox();
    const controls = await row.locator(':scope > .setting-item-control').boundingBox();
    expect(description && controls && controls.y >= description.y + description.height - 1).toBeTruthy();
  }
  expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(content).toHaveScreenshot('settings-narrow.png');
});

test('vault options preserve drafts across tabs and actions, fix the vault, and copy the preview', async ({ host }) => {
  const settings = await openSettings(host);
  const modal = await openVaultOptions(settings);
  await expect(modal.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute('aria-selected', 'true');
  await modal.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(modal.locator('[data-uri-field="vault"]')).toHaveAttribute('readonly', '');
  await expect(modal.getByText('Choose a known vault', { exact: true })).toHaveCount(0);
  await modal.locator('[data-uri-field="action"]').selectOption('new');
  await expect(modal.locator('[data-uri-field="content-source"]')).toHaveValue('clipboard');
  await modal.locator('[data-uri-field="name"]').fill('Weekend soup');
  await modal.locator('[data-uri-field="content-source"]').selectOption('text');
  await modal.locator('[data-uri-field="text"]').fill('Carrots and potatoes');
  await modal.locator('[data-uri-field="action"]').selectOption('search');
  await modal.locator('[data-uri-field="action"]').selectOption('new');
  await expect(modal.locator('[data-uri-field="text"]')).toHaveValue('Carrots and potatoes');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await modal.getByRole('button', { name: 'Copy URI', exact: true }).click();
  const uri = await preview(modal);
  expect(uri.searchParams.get('vault')).toBe('Recipe Box');
  expect(uri.searchParams.get('content')).toBe('Carrots and potatoes');
  expect(await settings.evaluate(() => window.fixtureClipboard.text)).toBe(uri.href);
  expect(await settings.evaluate(() => window.fixtureClipboard.reads)).toBe(0);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('folder shortcuts default to fresh unnamed notes and preserve the fixed folder in search', async ({ host }) => {
  await host.page.setViewportSize({ width: 1100, height: 950 });
  const modal = await openFolderOptions(host.page);
  await modal.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(modal.locator('[data-uri-field="action"] option')).toHaveText(['Create a note', 'Search this folder']);
  await expect(modal.locator('[data-uri-field="folder"]')).toHaveValue('Meals');
  await expect(modal.locator('[data-uri-field="folder"]')).toHaveAttribute('readonly', '');
  expect((await preview(modal)).searchParams.get('file')).toBe('Meals/Untitled.md');
  await expect(modal.getByRole('button', { name: 'Create shortcut', exact: true })).toBeEnabled();
  await modal.locator('[data-uri-field="name"]').fill('../Escape');
  await expect(modal.getByRole('button', { name: 'Create shortcut', exact: true })).toBeDisabled();
  await modal.locator('[data-uri-field="name"]').fill('Sunday soup');
  await modal.locator('[data-uri-field="action"]').selectOption('search');
  expect((await preview(modal)).searchParams.get('query')).toBe('match-case:(path:/^Meals\\//)');
  await expect(modal.locator('[data-uri-field="query"]')).toHaveAttribute('readonly', '');
  await modal.locator('[data-uri-field="action"]').selectOption('new');
  await expect(modal.locator('[data-uri-field="name"]')).toHaveValue('Sunday soup');
  await modal.locator('[data-uri-field="name"]').fill('');
  await expect(modal).toHaveScreenshot('folder-advanced.png');
});

test('clicked-note and attachment menus retain the clicked target and coherent actions', async ({ host }) => {
  let modal = await openFileOptions(host.page);
  await modal.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(modal.locator('[data-uri-field="file"]')).toHaveValue('Meals/Comfort soup.md');
  await expect(modal.locator('[data-uri-field="file"]')).toHaveAttribute('readonly', '');
  await modal.locator('[data-uri-field="action"]').selectOption('append');
  expect((await preview(modal)).searchParams.get('clipboard')).toBe('true');
  expect((await preview(modal)).searchParams.get('file')).toBe('Meals/Comfort soup.md');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  modal = await openFileOptions(host.page, 'Attachments/menu.csv');
  await modal.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(modal.locator('[data-uri-field="action"] option')).toHaveText(['Open vault or file']);
  expect((await preview(modal)).searchParams.get('file')).toBe('Attachments/menu.csv');
});

test('detached image controls import through their own document and preserve selection on cancellation and paste failure', async ({ host }) => {
  const settings = await openSettings(host);
  const modal = await openVaultOptions(settings);
  await modal.getByRole('radio', { name: 'Custom image', exact: true }).check();
  await expect(modal.getByRole('button', { name: 'Use Obsidian icon', exact: true })).toHaveCount(0);
  await chooseImage(settings, modal);
  const image = modal.locator('img');
  const previous = await image.getAttribute('src');
  const chooser = settings.waitForEvent('filechooser');
  await modal.getByRole('button', { name: 'Choose image…', exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(image).toHaveAttribute('src', previous ?? '');
  await modal.getByRole('button', { name: 'Paste image', exact: true }).click();
  await expect(settings.locator('.notice')).toContainText(/no supported image/i);
  await expect(image).toHaveAttribute('src', previous ?? '');
  await settings.evaluate(() => { window.fixtureClipboard.denied = true; });
  await modal.getByRole('button', { name: 'Paste image', exact: true }).click();
  await expect(settings.locator('.notice').last()).toContainText('Clipboard access was denied');
  await expect(image).toHaveAttribute('src', previous ?? '');
  await settings.evaluate(() => { window.fixtureClipboard.denied = false; });
  await seedClipboardImage(settings);
  await modal.getByRole('button', { name: 'Paste image', exact: true }).click();
  await expect.poll(() => settings.evaluate(() => window.fixtureClipboard.reads)).toBe(3);
  await expect(modal.getByRole('button', { name: 'Create shortcut', exact: true })).toBeEnabled();
  expect(await image.evaluate(element => element.ownerDocument === document)).toBe(true);
  await modal.getByRole('button', { name: 'Copy URI', exact: true }).click();
  expect(await settings.evaluate(() => window.fixtureClipboard.png)).toBeUndefined();
  await modal.getByRole('button', { name: 'Paste image', exact: true }).click();
  await expect.poll(() => settings.evaluate(() => window.fixtureClipboard.reads)).toBe(4);
  await expect(image).toHaveAttribute('src', previous ?? '');
  await expect(settings.locator('.notice')).toHaveCount(0, { timeout: 15000 });
  await expect(modal).toHaveScreenshot('custom-icon-general.png');
});

test('other-vault manual selection stays fixed in More options when native discovery is unavailable', async ({ host }) => {
  const settings = await openSettings(host);
  await settings.getByRole('button', { name: 'Create shortcut to another vault', exact: true }).click();
  await settings.locator('.modal input[type="text"]').fill('Kitchen Archive');
  await settings.getByRole('button', { name: 'More options…', exact: true }).click();
  const modal = settings.locator('.vault-shortcuts-uri-modal');
  await modal.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(modal.locator('[data-uri-field="vault"]')).toHaveValue('Kitchen Archive');
  await expect(modal.locator('[data-uri-field="vault"]')).toHaveAttribute('readonly', '');
  await modal.locator('[data-uri-field="action"]').selectOption('new');
  await modal.locator('[data-uri-field="name"]').fill('Soup');
  expect((await preview(modal)).searchParams.get('vault')).toBe('Kitchen Archive');
});
