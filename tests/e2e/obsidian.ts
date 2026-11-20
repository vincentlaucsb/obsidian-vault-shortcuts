import { chromium, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { App } from 'obsidian';
import { createSendToLinkScript } from '../../src/sendTo/windows';
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as nodeSetTimeout, clearTimeout as nodeClearTimeout } from 'node:timers';

export const repository = resolve(__dirname, '../..');
export const obsidianVersion = '1.15.0';

async function removeFixture(directory: string): Promise<void> {
  const build = await realpath(join(repository, '.test-build'));
  const target = await realpath(directory);
  if (build !== join(await realpath(repository), '.test-build') || dirname(target) !== build || !basename(target).startsWith('ui-')) {
    throw new Error('Refusing to remove a fixture outside this workspace.');
  }
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export interface ObsidianHost {
  close: (retain?: boolean) => Promise<void>;
  page: Page;
  directory: string;
  vault: string;
}

declare global {
  interface Window {
    app: App;
    require: (id: string) => unknown;
    fixtureBlockedProcesses: string[];
  }
}

export async function launchObsidian(theme: 'dark' | 'light' = 'dark', agent = false, sendToCapture = false): Promise<ObsidianHost> {
  if (process.platform !== 'win32') throw new Error('The UI suite currently requires a Windows Obsidian host.');
  const executable = process.env.OBSIDIAN_EXECUTABLE ?? join(process.env.LOCALAPPDATA ?? '', 'Obsidian', 'Obsidian.exe');
  await access(executable);
  await mkdir(join(repository, '.test-build'), { recursive: true });
  const directory = await mkdtemp(join(repository, '.test-build/ui-'));
  const vault = join(directory, agent ? 'Recipe Box café' : 'Recipe Box');
  const appData = join(directory, 'appdata');
  const profile = join(appData, 'obsidian');
  const local = join(directory, 'local');
  const home = join(directory, 'home');
  const fixture: unknown = JSON.parse(await readFile(join(repository, 'tests/fixtures/vault.json'), 'utf8'));
  if (typeof fixture !== 'object' || fixture === null || !('configDir' in fixture) || typeof fixture.configDir !== 'string' ||
      !/^[.a-z-]+$/.test(fixture.configDir) || fixture.configDir === '.' || fixture.configDir === '..') throw new Error('Invalid fixture config directory.');
  const configName = agent ? ".profile d’été" : fixture.configDir;
  const configDir = join(vault, configName);
  const plugin = join(configDir, 'plugins/vault-shortcuts');
  await Promise.all([profile, local, home, plugin, join(vault, 'Meals'), join(vault, 'Attachments')].map(path => mkdir(path, { recursive: true })));
  await Promise.all(['main.js', 'manifest.json', 'styles.css'].map(name => copyFile(join(repository, name), join(plugin, name))));
  await Promise.all([
    writeFile(join(profile, 'obsidian.json'), JSON.stringify({ updateDisabled: true, vaults: { '0123456789abcdef': { path: vault, ts: 1, open: !sendToCapture } } })),
    writeFile(join(profile, '0123456789abcdef.json'), '{}'),
    writeFile(join(configDir, 'community-plugins.json'), JSON.stringify(['vault-shortcuts'])),
    writeFile(join(configDir, 'app.json'), JSON.stringify({ alwaysUpdateLinks: true, showUnsupportedFiles: true })),
    writeFile(join(configDir, 'appearance.json'), JSON.stringify({ theme: theme === 'dark' ? 'obsidian' : 'moonstone', baseFontSize: 16 })),
    writeFile(join(vault, 'Welcome.md'), '# Recipe Box\n\nA fictional recipe notebook for Vault Shortcuts.\n'),
    writeFile(join(vault, 'Meals/Comfort soup.md'), '---\ntags: [comfort, meals/soup]\n---\n# Comfort soup\n\n## Ingredients\n\nCarrots, potatoes and vegetable broth.\n\n## Method\n\nSimmer until tender.\n'),
    writeFile(join(vault, 'Meals/Skillet potatoes.md'), '# Skillet potatoes\n\nCrisp potatoes with rosemary.\n'),
    writeFile(join(vault, 'Attachments/menu.csv'), 'dish,servings\nComfort soup,4\n'),
  ]);
  const desktop = join(directory, 'Desktop café');
  const programs = join(directory, 'Programs');
  const sendTo = join(directory, 'SendTo');
  if (sendToCapture) {
    await Promise.all([mkdir(sendTo), mkdir(join(vault, 'Daily'))]);
    await writeFile(join(vault, 'Daily/Today.md'), '# Today\n\nExisting entry.\n');
  }
  if (agent) {
    await Promise.all([mkdir(desktop), mkdir(programs),
      writeFile(join(vault, 'Meals/Crème brûlée.md'), '# Dessert\n\nKeep this exact content.\n'),
      copyFile(join(repository, 'tests/fixtures/recipes-pot-pie.png'), join(vault, 'Attachments/Icône dîner.png'))]);
  }
  // The Send to fixture starts with a closed but registered vault and uses the
  // same open URI on startup. Invoke the isolated executable directly so the
  // desktop's registered protocol handler never targets a personal profile.
  const startUri = sendToCapture ? [`obsidian://open?path=${encodeURIComponent(vault.replace(/\\/g, '/'))}`] : [];
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--disable-gpu', '--no-first-run', ...startUri], {
    env: { ...process.env, APPDATA: appData, LOCALAPPDATA: local, USERPROFILE: home, HOME: home },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser: Browser | undefined;
  let logs = '';
  child.stdout.on('data', (data: Buffer) => { logs = (logs + data.toString()).slice(-65536); });
  const endpoint = new Promise<string>((resolveEndpoint, reject) => {
    const timer = nodeSetTimeout(() => { reject(new Error(`Obsidian debug startup timed out.\n${logs}`)); }, 30000);
    const fail = (error: Error): void => { nodeClearTimeout(timer); reject(error); };
    child.once('error', fail);
    child.once('exit', code => { fail(new Error(`Obsidian exited during startup: ${String(code)}\n${logs}`)); });
    child.stderr.on('data', (data: Buffer) => {
      logs = (logs + data.toString()).slice(-65536);
      const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[\w-]+)/.exec(logs);
      if (match) { nodeClearTimeout(timer); resolveEndpoint(match[1]); }
    });
  });
  let exited = false;
  const exit = new Promise<void>(finish => { child.once('exit', () => { exited = true; finish(); }); });
  const close = async (retain = false): Promise<void> => {
    // Close only this CDP connection/process; never enumerate or kill apps by name.
    const watchdog = nodeSetTimeout(() => { if (!exited) child.kill(); }, 2000);
    let deadline: NodeJS.Timeout | undefined;
    let closed = false;
    try {
      await Promise.race([
        browser?.close() ?? Promise.resolve(),
        new Promise<never>((_resolve, reject) => {
          deadline = nodeSetTimeout(() => { reject(new Error('Isolated Obsidian close timed out.')); }, 4000);
        }),
      ]);
      closed = true;
    }
    finally {
      nodeClearTimeout(watchdog);
      if (deadline) nodeClearTimeout(deadline);
      if (!exited) child.kill();
      await Promise.race([exit, new Promise<void>(finish => { nodeSetTimeout(finish, 2000).unref(); })]);
      await writeFile(join(directory, 'host.log'), logs);
      if (!retain && closed && exited) {
        await removeFixture(directory);
      }
    }
  };
  try {
    browser = await chromium.connectOverCDP(await endpoint);
    const context = browser.contexts()[0];
    if (!context) throw new Error('Obsidian did not expose a browser context.');
    // This synthetic vault ID exists only in the disposable profile. Bootstrap
    // our own plugin as enabled before reload; never alter a personal profile.
    await context.addInitScript(({ agent, configName, desktop, programs, sendToCapture, sendTo, local, vault, linkScript }) => {
      // Bootstrap only the synthetic vault before its App exists. Runtime
      // plugin settings still use loadData/saveData; user storage is untouched.
      if (location.protocol === 'app:') {
        window.localStorage.setItem('enable-plugin-0123456789abcdef', 'true');
        if (agent) window.localStorage.setItem('0123456789abcdef-config', configName);
      }
      // Install before plugin imports: desktop.ts captures a promisified
      // execFile at module load. Environment paths alone do not isolate Known Folders.
      const native = window.require('node:child_process');
      if (typeof native !== 'object' || native === null || !('execFile' in native)) throw new Error('Missing native process boundary.');
      const realExec = native.execFile;
      if (typeof realExec !== 'function') throw new Error('Missing native process function.');
      window.fixtureBlockedProcesses = [];
      const deny = (file: unknown): never => {
        window.fixtureBlockedProcesses.push(typeof file === 'string' ? file : 'Unexpected executable');
        throw new Error('Native subprocesses are disabled in the isolated UI test profile.');
      };
      const blocked = (file: string, args: string[], _options: unknown,
        callback: (error: Error | null, stdout: string) => void): { stdin?: undefined } => {
        if (sendToCapture && (file === process.execPath || file === process.execPath.replace(/\.exe$/i, '.com')) &&
            args[0] === 'vault=Recipe Box') {
          if (args.length === 3 && args[1] === 'vault' && args[2] === 'info=path') { callback(null, vault); return {}; }
          if (args.length === 2 && args[1] === 'daily:path') { callback(null, 'Daily/Today.md'); return {}; }
          if (args.length === 2 && args[1] === 'daily') {
            void window.app.vault.create('Daily/Today.md', '# Daily template\n').then(
              () => { callback(null, ''); }, (error: unknown) => { callback(error instanceof Error ? error : new Error(String(error)), ''); });
            return {};
          }
        }
        return deny(file);
      };
      native.execFile = blocked;
      if (agent || sendToCapture) {
        Object.defineProperty(blocked, Symbol.for('nodejs.util.promisify.custom'), {
          value: (file: string, args: string[], options: { env?: NodeJS.ProcessEnv }): Promise<{ stdout: string }> => {
            if (file.toLowerCase().endsWith('\\system32\\windowspowershell\\v1.0\\powershell.exe') &&
                args[0] === '-NoProfile' && args[1] === '-NonInteractive' && args[2] === '-Command' && args.length === 4) {
              if (agent && args[3].endsWith('::DesktopDirectory)')) return Promise.resolve({ stdout: desktop });
              if (agent && args[3].endsWith('::Programs)')) return Promise.resolve({ stdout: programs });
              if (sendToCapture && args[3].endsWith('::SendTo)')) return Promise.resolve({ stdout: sendTo });
              const env = options.env;
              if (sendToCapture && args[3] === linkScript && env) {
                const prefix = `${local}\\VaultShortcuts\\SendTo\\`;
                const link = env.VAULT_SHORTCUTS_LINK ?? '';
                const name = link.slice(prefix.length);
                if (link.toLowerCase().startsWith(prefix.toLowerCase()) && /^[a-f0-9]{64}\\[a-f0-9-]{36}\.lnk$/.test(name) &&
                    env.VAULT_SHORTCUTS_LAUNCHER === link.replace(/[a-f0-9-]{36}\.lnk$/, 'send-image.js') &&
                    env.VAULT_SHORTCUTS_TARGET === file.replace(/WindowsPowerShell\\v1\.0\\powershell\.exe$/i, 'wscript.exe') &&
                    ['new', 'daily'].includes(env.VAULT_SHORTCUTS_MODE ?? '') && env.VAULT_SHORTCUTS_ICON === process.execPath) {
                  return new Promise((resolveLink, rejectLink) => {
                    Reflect.apply(realExec, native, [file, args, options, (error: Error | null, stdout: string) => {
                      if (error) rejectLink(error);
                      else resolveLink({ stdout });
                    }]);
                  });
                }
              }
            }
            return deny(file);
          },
        });
      }
    }, { agent, configName, desktop, programs, sendToCapture, sendTo, local, vault, linkScript: createSendToLinkScript });
    const page = context.pages()[0] ?? await context.waitForEvent('page');
    page.on('pageerror', error => { logs += `\nRenderer error: ${error.message}`; });
    page.on('console', message => { if (message.type() === 'error') logs += `\nRenderer console: ${message.text()}`; });
    await page.reload();
    await expect(page.locator('.workspace')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.nav-folder-title[data-path="Meals"]')).toBeVisible();
    await page.evaluate(() => new Promise<void>(ready => { window.app.workspace.onLayoutReady(ready); }));
    const identity = await page.evaluate(() => {
      const adapter: unknown = window.app.vault.adapter;
      function hasBasePath(value: unknown): value is { getBasePath: () => unknown } {
        return typeof value === 'object' && value !== null && 'getBasePath' in value && typeof value.getBasePath === 'function';
      }
      if (!hasBasePath(adapter)) throw new Error('Expected filesystem vault.');
      const path: unknown = adapter.getBasePath();
      return { path, title: document.title, profile: process.env.APPDATA, config: window.app.vault.configDir };
    });
    expect(identity.path).toBe(vault);
    expect(identity.profile).toBe(appData);
    expect(identity.config).toBe(configName);
    expect(identity.title).toContain(obsidianVersion);
    return { close, page, directory, vault };
  } catch (error: unknown) {
    await close(true);
    throw error;
  }
}
