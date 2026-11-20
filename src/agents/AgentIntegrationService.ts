import { FileSystemAdapter, Platform } from 'obsidian';
import type { App } from 'obsidian';
import { lstat, open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { iconPlatform, prepareImageIcon, storePreparedIcon } from '../icons/image';
import type { IconSelection } from '../icons/image';
import { MAX_IMAGE_BYTES } from '../icons/assets';
import type { IShortcutCreator } from '../shortcuts/IShortcutCreator';
import type { ShortcutDestination } from '../shortcuts/WindowsShortcutCreator';
import { verifyVaultId } from '../vaultIdentity';
import { AgentMailbox, mailboxPath } from './mailbox';
import { AgentSkillInstallation, pluginRelativeDirectory } from './installation';
import { agentShortcutHandler } from './shortcuts';

async function readVaultImage(root: string, file: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!/\.(png|jpe?g|ico)$/i.test(file)) throw new Error('Choose a PNG, JPEG or ICO attachment.');
  const parts = file.split('/');
  let path = root;
  for (const part of parts.slice(0, -1)) {
    path = join(path, part);
    if (!(await lstat(path)).isDirectory()) throw new Error('Choose an image inside the vault without linked directories.');
  }
  const full = join(root, file);
  if (!(await lstat(full)).isFile()) throw new Error('Choose an image file inside the vault, without links.');
  const handle = await open(full, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 20 MB.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
      if (!bytesRead) throw new Error('The icon attachment changed while it was being read.');
      offset += bytesRead;
    }
    return bytes;
  } finally { await handle.close(); }
}

export class AgentIntegrationService {
  private mailbox?: AgentMailbox;
  private closed = false;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly root: string;
  private readonly pluginDirectory: string;
  private readonly installation: AgentSkillInstallation;

  constructor(
    private readonly app: App, pluginDirectory: string,
    private readonly creator: (destination: ShortcutDestination) => IShortcutCreator,
    private readonly resolveIcon: (selection: IconSelection) => Promise<string | undefined>,
  ) {
    if (!(app.vault.adapter instanceof FileSystemAdapter)) throw new Error('Agent integration requires a local desktop vault.');
    this.root = app.vault.adapter.getBasePath();
    this.pluginDirectory = pluginRelativeDirectory(this.root, pluginDirectory);
    const key = `vault-shortcuts:${this.pluginDirectory}:agent-integration`;
    this.installation = new AgentSkillInstallation(this.root, this.pluginDirectory,
      (): unknown => app.loadLocalStorage(key), value => app.saveLocalStorage(key, value));
  }

  enable(): Promise<string[]> {
    return this.run(async () => {
      await this.getMailbox().prepare();
      return this.installation.enable();
    });
  }

  testConnection(): Promise<void> {
    return this.run(async () => {
      this.ensureEnabled();
      await this.getMailbox().test(() => { this.ensureEnabled(); });
    });
  }

  remove(): Promise<string[]> {
    return this.run(() => this.installation.remove());
  }

  async receive(id: string): Promise<void> {
    if (this.closed || !this.installation.enabled) return;
    await this.getMailbox().receive(id, () => { this.ensureEnabled(); });
  }

  dispose(): void {
    this.closed = true;
  }

  private ensureEnabled(): void {
    if (this.closed || !this.installation.enabled) throw new Error('Enable or repair agent integration in this vault first.');
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      if (this.closed) throw new Error('Vault Shortcuts is disabled.');
      return operation();
    });
    this.pending = result.catch(() => {});
    return result;
  }

  private getMailbox(): AgentMailbox {
    const vault = this.app.vault;
    return this.mailbox ??= new AgentMailbox(() => mailboxPath(this.root, this.pluginDirectory, Platform.isWin), agentShortcutHandler({
      vaultName: () => vault.getName(),
      file: path => {
        const file = vault.getFileByPath(path);
        if (!file || file.path !== path) return undefined;
        return { markdown: file.extension.toLowerCase() === 'md', verify: () => {
          if (file.path !== path || vault.getFileByPath(path) !== file) throw new Error('The target file changed or no longer exists.');
        } };
      },
      folder: path => {
        const folder = path ? vault.getFolderByPath(path) : vault.getRoot();
        if (!folder || (path && folder.path !== path)) return undefined;
        return () => {
          if (path ? folder.path !== path || vault.getFolderByPath(path) !== folder : vault.getRoot() !== folder) {
            throw new Error('The target folder changed or no longer exists.');
          }
        };
      },
      verifyVaultId: value => verifyVaultId(value, this.root, Platform.isWin),
      prepareIcon: async icon => {
        if (icon.mode !== 'custom') {
          const path = await this.resolveIcon(icon);
          return () => Promise.resolve(path);
        }
        const file = vault.getFileByPath(icon.file);
        if (!file || file.path !== icon.file) throw new Error('No icon attachment has that exact vault-relative path.');
        const bytes = await readVaultImage(this.root, file.path);
        const workspace = this.app.workspace.containerEl.createDiv();
        workspace.hidden = true;
        const platform = iconPlatform();
        try {
          const prepared = await prepareImageIcon({ name: basename(file.path), size: bytes.length,
            arrayBuffer: () => Promise.resolve(bytes.buffer) }, workspace, platform);
          return () => storePreparedIcon(prepared, platform);
        } finally { workspace.remove(); }
      },
      creator: this.creator,
      windows: Platform.isWin,
      extension: Platform.isLinux ? 'desktop' : 'url',
    }));
  }
}
