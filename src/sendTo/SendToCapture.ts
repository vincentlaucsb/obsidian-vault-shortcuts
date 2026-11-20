import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { lstat, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { App, TFile } from 'obsidian';
import { importImage, readImageRequest } from './importImage';
import { hasErrorCode, WindowsSendTo } from './windows';

const ticketName = /^[a-z0-9]+\.tmp\.request$/i;

export class SendToCapture {
  private readonly installation: Promise<WindowsSendTo>;
  private watcher?: FSWatcher;
  private drain?: Promise<void>;
  private pending = false;
  private closed = false;
  private actions = Promise.resolve();

  constructor(private readonly app: App, private readonly vaultRoot: string,
    private readonly folder: () => string, private readonly report: (message: string) => void) {
    this.installation = WindowsSendTo.forVault(vaultRoot, app.vault.getName());
  }

  restore(): Promise<void> {
    return this.run(async installation => { if (await installation.isEnabled()) this.start(installation); });
  }

  enable(): Promise<void> {
    return this.run(async installation => {
      await installation.install();
      this.start(installation);
      this.report('Windows Send to entries are ready for this vault.');
    });
  }

  remove(): Promise<void> {
    return this.run(async installation => {
      const preserved = await installation.remove();
      this.stop();
      await this.drain;
      this.report(preserved.length ? `Windows Send to disabled. Changed entries were preserved: ${preserved.join(', ')}` :
        'Windows Send to entries removed.');
    });
  }

  dispose(): void {
    this.closed = true;
    this.stop();
  }

  private stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private run(action: (installation: WindowsSendTo) => Promise<void>): Promise<void> {
    const next = this.actions.then(async () => {
      const installation = await this.installation;
      if (!this.closed) await action(installation);
    });
    this.actions = next.catch(() => {});
    return next;
  }

  private start(installation: WindowsSendTo): void {
    if (this.closed || this.watcher) return;
    this.watcher = watch(installation.directory, { persistent: false }, () => { this.schedule(installation); });
    this.watcher.on('error', error => {
      this.stop();
      this.report(`Windows Send to could not watch for images. Enable or repair it in settings. ${error.message}`);
    });
    this.schedule(installation);
  }

  private schedule(installation: WindowsSendTo): void {
    this.pending = true;
    if (!this.watcher || this.drain) return;
    this.drain = this.processPending(installation).catch((error: unknown) => {
      this.report(`Windows Send to could not read its queue. ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      this.drain = undefined;
      if (this.pending && this.watcher) this.schedule(installation);
    });
  }

  private async showCapture(note: TFile): Promise<void> {
    if (this.closed) return;
    const workspace = this.app.workspace;
    try {
      const openTab = workspace.getLeavesOfType('markdown').find(leaf => leaf.getViewState().state?.file === note.path);
      if (openTab) {
        await workspace.revealLeaf(openTab);
        workspace.setActiveLeaf(openTab, { focus: true });
      } else {
        await workspace.getLeaf('tab').openFile(note, { active: true });
      }
      this.report(`Image added to ${note.path}.`);
    } catch (error: unknown) {
      this.report(`Image added to ${note.path}, but the note could not be opened. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processPending(installation: WindowsSendTo): Promise<void> {
    this.pending = false;
    if (!await installation.isEnabled()) return;
    for (const filename of await readdir(installation.directory)) {
      if (!this.watcher) return;
      if (!ticketName.test(filename)) continue;
      const path = join(installation.directory, filename);
      const claimed = `${path}.processing`;
      try { await rename(path, claimed); }
      catch (error: unknown) { if (hasErrorCode(error, 'ENOENT')) continue; throw error; }
      try {
        const info = await lstat(claimed);
        if (!info.isFile() || info.size > 16384) throw new Error('Invalid image request.');
        const request = (await readFile(claimed, 'utf16le')).replace(/^\uFEFF/, '');
        const [mode, source, extra] = request.split('\n');
        if (extra !== undefined) throw new Error('Invalid image request.');
        const result = await importImage(this.app, this.vaultRoot, this.folder(), readImageRequest({ mode, source }));
        await this.showCapture(result);
      } catch (error: unknown) {
        this.report(`Could not import image. ${error instanceof Error ? error.message : String(error)}`);
      } finally { await unlink(claimed); }
    }
  }
}
