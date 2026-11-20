import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { hasErrorCode } from './mailbox';
import { agentSkill, SKILL_PATHS } from './skill';

type SkillPath = typeof SKILL_PATHS[number];
export interface AgentInstallation {
  version: 1;
  enabled: boolean;
  files: Partial<Record<SkillPath, string>>;
}

export function pluginRelativeDirectory(root: string, directory: string): string {
  const path = relative(root, resolve(root, directory)).split(sep).join('/');
  if (!path || path === '..' || path.startsWith('../') || isAbsolute(path) ||
    Array.from(path).some(character => character.charCodeAt(0) < 32)) {
    throw new Error('The active plugin directory must be inside this vault.');
  }
  return path;
}

function readState(value: unknown): AgentInstallation {
  if (value == null) return { version: 1, enabled: false, files: {} };
  if (typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
      !('enabled' in value) || typeof value.enabled !== 'boolean' ||
      !('files' in value) || typeof value.files !== 'object' || !value.files || Array.isArray(value.files)) {
    throw new Error('The local agent installation record is invalid. Existing skills have been preserved.');
  }
  const files: AgentInstallation['files'] = {};
  for (const [path, digest] of Object.entries(value.files)) {
    const known = SKILL_PATHS.find(skill => skill === path);
    if (!known || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error('The local agent skill ownership record is invalid. Existing skills have been preserved.');
    }
    files[known] = digest;
  }
  return { version: 1, enabled: value.enabled, files };
}

class PreserveSkill extends Error {}
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class AgentSkillInstallation {
  private readonly content: Buffer;
  private readonly digest: string;

  constructor(
    private readonly root: string, pluginDirectory: string,
    private readonly load: () => unknown, private readonly save: (state: AgentInstallation) => void,
  ) {
    this.content = Buffer.from(agentSkill(pluginDirectory));
    this.digest = hash(this.content);
  }

  get enabled(): boolean { return readState(this.load()).enabled; }

  async enable(): Promise<string[]> {
    return this.update(true);
  }

  async remove(): Promise<string[]> {
    return this.update(false);
  }

  private async parents(path: string, create: boolean): Promise<void> {
    let directory = this.root;
    for (const part of dirname(path).split('/')) {
      directory = join(directory, part);
      if (create) await mkdir(directory).catch((error: unknown) => { if (!hasErrorCode(error, 'EEXIST')) throw error; });
      if (!(await lstat(directory)).isDirectory()) throw new PreserveSkill();
    }
  }

  private async snapshot(path: SkillPath): Promise<string | undefined> {
    try {
      await this.parents(path, false);
      const full = join(this.root, path);
      const info = await lstat(full);
      if (!info.isFile() || info.size > 64 * 1024) throw new PreserveSkill();
      return hash(await readFile(full));
    } catch (error: unknown) { if (hasErrorCode(error, 'ENOENT')) return undefined; throw error; }
  }

  private async write(path: SkillPath, before: string | undefined): Promise<void> {
    await this.parents(path, true);
    const full = join(this.root, path);
    if (before === undefined) {
      try { await writeFile(full, this.content, { flag: 'wx' }); }
      catch (error: unknown) { if (hasErrorCode(error, 'EEXIST')) throw new PreserveSkill(); throw error; }
    } else if (before !== this.digest) {
      const temporary = `${full}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, this.content, { flag: 'wx' });
        if (await this.snapshot(path) !== before) throw new PreserveSkill();
        await rename(temporary, full);
      } finally { await unlink(temporary).catch((error: unknown) => { if (!hasErrorCode(error, 'ENOENT')) throw error; }); }
    } else if (await this.snapshot(path) !== before) throw new PreserveSkill();
  }

  private async update(enable: boolean): Promise<string[]> {
    if (!enable) {
      const state = readState(this.load());
      this.save({ ...state, enabled: false });
    }
    const lockPath = join(this.root, '.vault-shortcuts-install.lock');
    const handle = await open(lockPath, 'wx').catch((error: unknown) => {
      if (hasErrorCode(error, 'EEXIST')) {
        throw new Error('Another skill setup owns .vault-shortcuts-install.lock. If setup stopped, remove that lock and retry.');
      }
      throw error;
    });
    try {
      const state = readState(this.load());
      const preserved: string[] = [];
      for (const path of SKILL_PATHS) {
        const owned = state.files[path];
        if (!enable && owned === undefined) continue;
        try {
          const before = await this.snapshot(path);
          if (before !== undefined && before !== owned && (!enable || before !== this.digest)) throw new PreserveSkill();
          if (enable) {
            // An identical unowned copy is already usable. Leave ownership where it is.
            if (owned === undefined && before === this.digest) continue;
            await this.write(path, before);
            state.files[path] = this.digest;
          } else {
            if (before !== undefined) {
              if (await this.snapshot(path) !== before) throw new PreserveSkill();
              await unlink(join(this.root, path));
            }
            delete state.files[path];
          }
          this.save(state);
        } catch (error: unknown) {
          if (!(error instanceof PreserveSkill)) throw error;
          preserved.push(path);
        }
      }
      if (enable) {
        state.enabled = true;
        this.save(state);
      }
      return preserved;
    } finally {
      try { await handle.close(); }
      finally { await unlink(lockPath); }
    }
  }
}
