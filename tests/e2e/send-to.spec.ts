import { execFile } from 'node:child_process';
import { copyFile, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { sendToLinkName } from '../../src/sendTo/windows';
import type { CaptureMode } from '../../src/sendTo/windows';
import { expect, iconImage, openSettings, test } from './fixtures';

const exec = promisify(execFile);
test.use({ sendToVault: true });

test('Explorer entries copy an image to a configured note folder or append it to today’s note', async ({ host }) => {
  const settings = await openSettings(host);
  const click = async (button: string, notice: string): Promise<void> => {
    await settings.getByRole('button', { name: button, exact: true }).click();
    await expect(settings.locator('.notice').last()).toContainText(notice);
  };
  const folder = settings.getByPlaceholder('Vault root');
  await folder.fill('../outside');
  await click('Save folder', 'folder path relative to this vault');
  await folder.fill('Meals');
  await click('Save folder', 'New note folder saved');
  await click('Install Send to entries', 'entries are ready');

  const sendTo = join(host.directory, 'SendTo');
  const newLink = join(sendTo, sendToLinkName('new', 'Recipe Box'));
  const dailyLink = join(sendTo, sendToLinkName('daily', 'Recipe Box'));
  const source = join(host.directory, "Crème & 'pie'.png");
  await copyFile(iconImage, source);
  const before = await readFile(source);
  const system = join(process.env.SystemRoot ?? '', 'System32');
  const powershell = join(system, 'WindowsPowerShell/v1.0/powershell.exe');
  const invoke = async (shortcut: string, mode: CaptureMode, file: string): Promise<void> => {
    const command = '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ' +
      '$link = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TEST_SENDTO_LINK); ' +
      '$link.TargetPath; $link.Arguments';
    const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
      env: { ...process.env, TEST_SENDTO_LINK: shortcut }, windowsHide: true, timeout: 5000,
    });
    const [target, args] = stdout.trimEnd().split(/\r?\n/);
    expect(target.toLowerCase()).toBe(join(system, 'wscript.exe').toLowerCase());
    const match = /^\/\/E:JScript \/\/T:20 "([^"]+)" (new|daily)$/.exec(args);
    if (!match || match[2] !== mode) throw new Error(`Unexpected link arguments: ${args}`);
    expect(match[1].toLowerCase()).toContain(join(host.directory, 'local/VaultShortcuts/SendTo').toLowerCase());
    const launcherDirectory = dirname(match[1]);
    const fixtureLauncher = join(launcherDirectory, 'launcher-fixture.js');
    // Run the installed launcher in WScript with just the global Windows URL
    // dispatch stubbed. The queue's FileSystemObject still uses the real disk.
    const script = await readFile(match[1], 'utf8');
    await writeFile(fixtureLauncher, `(function(ActiveXObject) {
${script}
})(function(program) {
  if (program !== 'Shell.Application') return new ActiveXObject(program);
  return { ShellExecute: function(uri, args, directory, verb, show) {
    var files = new ActiveXObject('Scripting.FileSystemObject');
    var record = files.CreateTextFile(files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), 'open.log'), true, false);
    record.Write(uri + '\\n' + verb + '\\n' + show);
    record.Close();
  }};
});`);
    await exec(target, ['//E:JScript', '//T:20', fixtureLauncher, mode, file], { windowsHide: true, timeout: 6000 });
    expect(await readFile(join(launcherDirectory, 'open.log'), 'utf8')).toBe(
      `obsidian://open?path=${encodeURIComponent(host.vault.replace(/\\/g, '/'))}\nopen\n1`);
  };
  const activeNote = async (): Promise<string | undefined> =>
    await host.page.evaluate(() => window.app.workspace.getActiveFile()?.path);
  await invoke(newLink, 'new', source);
  const title = "Crème & 'pie'";
  const first = join(host.vault, 'Meals', `${title}.md`);
  await expect.poll(async () => await readFile(first, 'utf8').catch(() => '')).toContain(`![[${title}.png`);
  await expect.poll(activeNote).toBe(`Meals/${title}.md`);
  expect(await readFile(join(host.vault, 'Meals', `${title}.png`))).toEqual(before);

  await invoke(newLink, 'new', source);
  await expect.poll(async () => await readFile(join(host.vault, 'Meals', `${title} (2).md`), 'utf8').catch(() => ''))
    .toContain(`![[${title} (2).png`);
  await expect.poll(activeNote).toBe(`Meals/${title} (2).md`);
  expect(await readFile(first, 'utf8')).not.toContain('(2)');

  await invoke(dailyLink, 'daily', source);
  const daily = join(host.vault, 'Daily/Today.md');
  await expect.poll(async () => await readFile(daily, 'utf8')).toMatch(/^# Today\n\nExisting entry\.\n\n!\[\[/);
  await expect.poll(activeNote).toBe('Daily/Today.md');
  expect(await readFile(join(host.vault, 'Daily', `${title}.png`))).toEqual(before);
  expect(await readFile(source)).toEqual(before);

  await unlink(daily);
  await expect.poll(async () => await host.page.evaluate(() => window.app.vault.getFileByPath('Daily/Today.md') === null)).toBe(true);
  await invoke(dailyLink, 'daily', source);
  await expect.poll(async () => await readFile(daily, 'utf8').catch(() => '')).toMatch(/^# Daily template\n\n!\[\[/);
  await expect.poll(activeNote).toBe('Daily/Today.md');

  const invalid = join(host.directory, 'Invalid.png');
  await writeFile(invalid, 'An extension is not enough.');
  await invoke(newLink, 'new', invalid);
  await expect.poll(async () => (await settings.locator('.notice').allTextContents())
    .concat(await host.page.locator('.notice').allTextContents()).join('\n')).toContain('image data does not match');
  expect(await readdir(join(host.vault, 'Meals'))).not.toContain('Invalid.md');

  await unlink(newLink);
  await click('Install Send to entries', 'entries are ready');
  await writeFile(dailyLink, 'User changes');
  await click('Remove Send to entries', 'Changed entries were preserved');
  expect(await readdir(sendTo)).toEqual([sendToLinkName('daily', 'Recipe Box')]);
  expect(await readFile(dailyLink, 'utf8')).toBe('User changes');
  expect(await host.page.evaluate(() => window.fixtureBlockedProcesses)).toEqual([]);
});
