import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { mailboxPath } from '../../src/agents/mailbox';
import { AGENT_ACTION, SKILL_PATHS } from '../../src/agents/skill';
import { expect, openSettings, test } from './fixtures';

const exec = promisify(execFile);
test.use({ agentVault: true });

interface DesktopUriAction {
  action: string;
  path: string | null;
  request: string | null;
  file: string;
}

declare global {
  interface Window {
    // The desktop host calls this dispatcher after routing its URI to a vault window.
    OBS_ACT?: (params: DesktopUriAction) => void;
  }
}

test('detached settings install, test, repair and remove skills that call the real shortcut writer', async ({ host }) => {
  let settings = await openSettings(host);
  const skills = SKILL_PATHS.map(path => join(host.vault, path));
  const home = join(host.directory, 'home');
  const mailbox = await mailboxPath(host.vault, '.profile d’été/plugins/vault-shortcuts', true, home);
  const desktop = join(host.directory, 'Desktop café');
  const programs = join(host.directory, 'Programs');
  const note = join(host.vault, 'Meals/Crème brûlée.md');
  const before = await readFile(note);
  const click = async (name: string, notice: string): Promise<void> => {
    await settings.getByRole('button', { name, exact: true }).click();
    await expect(settings.locator('.notice').last()).toContainText(notice);
  };
  await expect(readdir(mailbox)).rejects.toHaveProperty('code', 'ENOENT');
  await click('Test connection', 'Enable or repair agent integration');
  await click('Enable or repair', 'Agent integration enabled');
  await click('Test connection', 'responded to help');
  const skill = await readFile(skills[0], 'utf8');
  expect(await Promise.all(skills.map(path => readFile(path, 'utf8')))).toEqual([skill, skill, skill]);
  expect(skill).toContain('.profile d’été/plugins/vault-shortcuts');
  const script = /```powershell\n([\s\S]*?)\n```/.exec(skill)?.[1];
  if (!script) throw new Error('Missing installed PowerShell connection instructions.');
  const powerShell = join(process.env.SystemRoot ?? '', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const call = async (operation: 'help' | 'preview' | 'create', data?: object): Promise<unknown> => {
    // Obsidian's Windows launcher forwards to a per-user pipe. Capture the URI
    // and invoke the synthetic renderer's real desktop protocol dispatcher.
    const uriFile = join(host.directory, `agent-${randomUUID()}.uri`);
    const setup = script.replace(/\nInvoke-VaultShortcut help$/, '') + '\n' +
      'function Open-VaultShortcutRequest($uri) { [IO.File]::WriteAllText($env:VAULT_SHORTCUTS_TEST_URI, $uri) }';
    const invoke = data ? `Invoke-VaultShortcut ${operation} @'\n${JSON.stringify(data)}\n'@` : 'Invoke-VaultShortcut help';
    const command = Buffer.from(`${setup}\n${invoke}`, 'utf16le').toString('base64');
    const shell = exec(powerShell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], {
      cwd: host.vault, env: { ...process.env, USERPROFILE: home, VAULT_SHORTCUTS_TEST_URI: uriFile, Path: '', PATH: '' },
      timeout: 10000, windowsHide: true,
    }).catch((error: unknown) => ({ stdout: '', error }));
    await expect.poll(async () => readFile(uriFile, 'utf8').catch(() => '')).toContain(`obsidian://${AGENT_ACTION}?`);
    const uri = new URL(await readFile(uriFile, 'utf8'));
    await unlink(uriFile);
    const path = uri.searchParams.get('path');
    const request = uri.searchParams.get('request');
    expect(uri.hostname).toBe(AGENT_ACTION);
    expect(path).toBe(host.vault.replace(/\\/g, '/'));
    expect(request).toMatch(/^[0-9a-f]{32}$/);
    expect([...uri.searchParams.keys()]).toEqual(['path', 'request']);
    await host.page.evaluate(params => {
      if (typeof window.OBS_ACT !== 'function') throw new Error('Missing Obsidian desktop URI dispatcher.');
      window.OBS_ACT(params);
    }, { action: AGENT_ACTION, path, request, file: '' });
    const { stdout } = await shell;
    if (!stdout) throw new Error(`PowerShell returned no agent result for ${operation}.`);
    const value: unknown = JSON.parse(stdout);
    return value;
  };
  expect(await call('help')).toMatchObject({ ok: true, version: 1, vault: 'Recipe Box café' });
  const request = { action: 'new', mode: 'replace', file: 'Meals/Crème brûlée.md', name: 'Capture café',
    content: { kind: 'text', text: 'é & # next\nline' } };
  const uri = 'obsidian://new?vault=Recipe%20Box%20caf%C3%A9&file=Meals%2FCr%C3%A8me%20br%C3%BBl%C3%A9e.md&overwrite=true&content=%C3%A9%20%26%20%23%20next%0Aline';
  expect(await call('preview', request)).toMatchObject({ ok: true, uri, launchEffect: expect.stringContaining('replaces') });
  expect(await readdir(desktop)).toEqual([]);
  const first = join(desktop, 'Capture café.url');
  const second = join(desktop, 'Capture café (2).url');
  expect(await call('create', request)).toMatchObject({ ok: true, path: first, uri });
  expect(await call('create', request)).toMatchObject({ ok: true, path: second, filename: 'Capture café (2).url', uri });
  expect(await readFile(first, 'utf8')).toContain(`URL=${uri}\r\n`);
  expect(await readFile(second)).toEqual(await readFile(first));
  const icon = { mode: 'custom', file: 'Attachments/Icône dîner.png' };
  const startMenuRequest = { action: 'open', file: 'Meals/Crème brûlée.md', name: 'Dessert', destination: 'start-menu', icon };
  const iconDir = join(host.directory, 'local/VaultShortcuts/Icons');
  expect(await call('preview', startMenuRequest)).toMatchObject({ ok: true, destination: 'start-menu' });
  await expect(readdir(iconDir)).rejects.toHaveProperty('code', 'ENOENT');
  const startMenuFile = join(programs, 'Dessert.url');
  expect(await call('create', startMenuRequest)).toMatchObject({ ok: true, path: startMenuFile });
  expect((await readFile(startMenuFile)).toString('utf16le')).toContain(`IconFile=${iconDir.replace(/\//g, '\\')}\\`);
  expect(await readFile(note)).toEqual(before);
  expect(await host.page.evaluate(() => window.fixtureClipboard.reads)).toBe(0);
  expect(await host.page.evaluate(() => window.fixtureBlockedProcesses)).toEqual([]);

  await writeFile(skills[0], 'User changes');
  await unlink(skills[1]);
  await rmdir(mailbox);
  await settings.close();
  await host.page.reload();
  await host.page.locator('.workspace').waitFor();
  settings = await openSettings(host);
  await expect(readdir(mailbox)).rejects.toHaveProperty('code', 'ENOENT');
  await click('Test connection', 'responded to help');
  expect(await readFile(skills[0], 'utf8')).toBe('User changes');
  await expect(readFile(skills[1])).rejects.toHaveProperty('code', 'ENOENT');
  await click('Enable or repair', 'Edited or linked skills were preserved');
  expect(await readFile(skills[0], 'utf8')).toBe('User changes');
  expect(await readFile(skills[1], 'utf8')).toBe(skill);
  await click('Remove', 'Agent integration disabled');
  expect(await readFile(skills[0], 'utf8')).toBe('User changes');
  for (const path of skills.slice(1)) await expect(readFile(path)).rejects.toHaveProperty('code', 'ENOENT');
  expect(await readdir(mailbox)).toEqual([]);
});
