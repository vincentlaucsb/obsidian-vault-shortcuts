import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AGENT_DIRECTORY } from './skill';

const MAX_REQUEST = 64 * 1024;
const MAX_AGE_MS = 60_000;
export type AgentOperation = 'help' | 'preview' | 'create';
type Handler = (operation: AgentOperation, body: unknown, ensureActive: () => void) => Promise<object>;

export function isRequestId(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{32}$/.test(value);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export async function mailboxPath(root: string, pluginDirectory: string, windows: boolean, home = homedir()): Promise<string> {
  const physicalRoot = await realpath(root);
  const directory = join(await realpath(home), AGENT_DIRECTORY);
  const fromVault = relative(physicalRoot, directory);
  if (!fromVault || (!isAbsolute(fromVault) && fromVault !== '..' && !fromVault.startsWith(`..${sep}`))) {
    throw new Error('The private agent request directory must be outside the vault.');
  }
  const identity = windows ?
    resolve(root).replace(/\\/g, '/').replace(/[A-Z]/g, letter => letter.toLowerCase()) : physicalRoot;
  const key = createHash('sha256').update(`${identity}\n${pluginDirectory}`).digest('hex');
  return join(directory, `requests-${key}`);
}

async function privateDirectory(path: string, create = false): Promise<void> {
  if (create) await mkdir(path, { mode: 0o700 }).catch((error: unknown) => { if (!hasErrorCode(error, 'EEXIST')) throw error; });
  const info = await lstat(path);
  if (!info.isDirectory() || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))) {
    throw new Error('The local agent request directory must be private and cannot be a link.');
  }
}

async function readRequest(path: string): Promise<{ operation: AgentOperation; body: unknown }> {
  const expected = await lstat(path);
  if (!expected.isFile() || (process.getuid && (expected.uid !== process.getuid() || (expected.mode & 0o077) !== 0))) {
    throw new Error('The agent request must be a private, regular file.');
  }
  const file = await open(path, 'r');
  let value: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.dev !== expected.dev || info.ino !== expected.ino) throw new Error('The agent request changed before opening.');
    if (info.size > MAX_REQUEST) throw new Error('The agent request exceeds 64 KiB.');
    if (Date.now() - info.mtimeMs > MAX_AGE_MS) throw new Error('The agent request expired.');
    const bytes = Buffer.alloc(info.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== info.size) throw new Error('The agent request changed while reading.');
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))); }
    catch { throw new Error('The agent request must contain UTF-8 JSON.'); }
  } finally { await file.close(); }

  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('operation' in value) ||
      (value.operation !== 'help' && value.operation !== 'preview' && value.operation !== 'create')) {
    throw new Error('Use a version 1 request with operation help, preview or create.');
  }
  return { operation: value.operation, body: 'request' in value ? value.request : undefined };
}

export class AgentMailbox {
  private pending = 0;

  constructor(private readonly directory: () => Promise<string>, private readonly handle: Handler) {}

  async prepare(): Promise<string> {
    const directory = await this.directory();
    await privateDirectory(resolve(directory, '..'), true);
    await privateDirectory(directory, true);
    return directory;
  }

  async receive(id: string, ensureActive: () => void): Promise<void> {
    if (!isRequestId(id) || this.pending >= 4) return;
    this.pending++;
    try {
      const base = await this.directory();
      const directory = join(base, id);
      await privateDirectory(resolve(base, '..'));
      await privateDirectory(base);
      await privateDirectory(directory);
      const input = join(directory, 'request.json');
      const output = join(directory, 'result.json');
      const ready = join(directory, 'ready');
      await lstat(input);
      // Acquire an exclusive claim before decoding or invoking a request. Replayed URLs are harmless.
      await writeFile(join(directory, 'claimed'), '', { flag: 'wx', mode: 0o600 });
      for (const path of [output, ready]) {
        const info = await lstat(path).catch((error: unknown) => {
          if (!hasErrorCode(error, 'ENOENT')) throw error;
        });
        if (info) return;
      }
      let result: object;
      try {
        const request = await readRequest(input).catch((error: unknown) => {
          if (!hasErrorCode(error, 'ENOENT')) throw error;
        });
        if (!request) return;
        await unlink(input);
        ensureActive();
        result = await this.handle(request.operation, request.body, ensureActive);
      } catch (error: unknown) {
        result = { ok: false, error: error instanceof Error ? error.message : 'The agent request failed.' };
      }
      await writeFile(output, JSON.stringify(result), { flag: 'wx', mode: 0o600 });
      await writeFile(ready, '', { flag: 'wx', mode: 0o600 });
    } catch (error: unknown) {
      if (!hasErrorCode(error, 'EEXIST') && !hasErrorCode(error, 'ENOENT')) throw error;
    } finally { this.pending--; }
  }

  async test(ensureActive: () => void): Promise<void> {
    const directory = await this.prepare();
    const id = randomUUID().replace(/-/g, '');
    const probe = join(directory, id);
    await mkdir(probe, { mode: 0o700 });
    try {
      await writeFile(join(probe, 'request.json'), JSON.stringify({ version: 1, operation: 'help' }), { flag: 'wx', mode: 0o600 });
      await this.receive(id, ensureActive);
      await lstat(join(probe, 'ready'));
      const result: unknown = JSON.parse(await readFile(join(probe, 'result.json'), 'utf8'));
      if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
        throw new Error('The local agent handoff did not respond to help.');
      }
    } finally {
      for (const path of ['request.json', 'result.json', 'ready', 'claimed']) {
        await unlink(join(probe, path)).catch((error: unknown) => { if (!hasErrorCode(error, 'ENOENT')) throw error; });
      }
      await rmdir(probe);
    }
  }
}
