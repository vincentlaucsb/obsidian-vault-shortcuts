import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { AgentMailbox, mailboxPath } from '../src/agents/mailbox';
import type { AgentOperation } from '../src/agents/mailbox';
import { AgentSkillInstallation } from '../src/agents/installation';
import type { AgentInstallation } from '../src/agents/installation';
import { agentSkill, SKILL_PATHS } from '../src/agents/skill';
import { agentShortcutHandler } from '../src/agents/shortcuts';
import type { AgentShortcutHost } from '../src/agents/shortcuts';
import { writeRequestShortcut } from '../src/shortcuts/files';
import { ShortcutIconError } from '../src/shortcuts/IShortcutCreator';

void test('enable and repair preserve edits, foreign skills and Copilot junctions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vault-shortcuts-skills-'));
  let state: AgentInstallation | undefined;
  const installation = new AgentSkillInstallation(root, '.profile alternative/plugins/vault-shortcuts',
    () => state, value => { state = value; });
  const paths = SKILL_PATHS.map(path => join(root, path));
  try {
    assert.equal(installation.enabled, false);
    assert.deepEqual(await installation.enable(), []);
    assert.equal(installation.enabled, true);
    const original = await readFile(paths[0], 'utf8');
    assert.match(original, /\.profile alternative\/plugins\/vault-shortcuts/);
    assert.deepEqual(await Promise.all(paths.map(path => readFile(path, 'utf8'))), [original, original, original]);
    await writeFile(paths[0], 'local edits');
    await unlink(paths[1]);
    const foreign = join(root, '.agents/skills/foreign/SKILL.md');
    await mkdir(dirname(foreign), { recursive: true });
    await writeFile(foreign, 'other plugin');
    const managed = join(root, 'copilot-managed');
    await unlink(paths[2]);
    await rmdir(dirname(paths[2]));
    await mkdir(managed);
    await writeFile(join(managed, 'SKILL.md'), original);
    await symlink(managed, dirname(paths[2]), 'junction');
    assert.deepEqual(await installation.enable(), [SKILL_PATHS[0], SKILL_PATHS[2]]);
    assert.equal(await readFile(paths[1], 'utf8'), original);
    assert.deepEqual(await installation.remove(), [SKILL_PATHS[0], SKILL_PATHS[2]]);
    assert.equal(installation.enabled, false);
    assert.equal(await readFile(paths[0], 'utf8'), 'local edits');
    assert.equal(await readFile(foreign, 'utf8'), 'other plugin');
    assert.equal(await readFile(paths[2], 'utf8'), original);
    await assert.rejects(readFile(paths[1]), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('remove disables startup even if a stale setup lock prevents cleanup and preserves identical unowned skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vault-shortcuts-skill-owner-'));
  let state: AgentInstallation | undefined;
  const profile = '.profile-test/plugins/vault-shortcuts';
  const installation = new AgentSkillInstallation(root, profile, () => state, value => { state = value; });
  try {
    const unowned = join(root, SKILL_PATHS[0]);
    await mkdir(dirname(unowned), { recursive: true });
    await writeFile(unowned, agentSkill(profile));
    await installation.enable();
    const lock = join(root, '.vault-shortcuts-install.lock');
    await writeFile(lock, '');
    await assert.rejects(installation.remove(), /Another skill setup owns/);
    assert.equal(installation.enabled, false);
    await unlink(lock);
    await installation.remove();
    assert.equal(await readFile(unowned, 'utf8'), agentSkill(profile));
    await assert.rejects(readFile(join(root, SKILL_PATHS[1])), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function stage(base: string, operation: AgentOperation, request?: object): Promise<string> {
  const id = randomUUID().replace(/-/g, '');
  const directory = join(base, id);
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'request.json'), JSON.stringify({ version: 1, operation, request }), { mode: 0o600 });
  return id;
}

async function result(base: string, id: string): Promise<{ ok: boolean; error?: unknown; path?: unknown; uri?: unknown }> {
  await readFile(join(base, id, 'ready'));
  const data: unknown = JSON.parse(await readFile(join(base, id, 'result.json'), 'utf8'));
  assert.ok(data && typeof data === 'object' && 'ok' in data && typeof data.ok === 'boolean');
  return { ...data, ok: data.ok };
}

void test('agent requests preserve validation, notes, icons and duplicate shortcuts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-shortcuts-connection-'));
  const root = join(directory, 'Vault café');
  const home = join(directory, 'home');
  const desktop = join(directory, 'Desktop café');
  await Promise.all([mkdir(root), mkdir(home), mkdir(desktop)]);
  const file = 'Packing list Café.md';
  await writeFile(join(root, file), '# Original');
  let iconWrites = 0;
  let iconFailure = false;
  let fileMoved = false;
  const host: AgentShortcutHost = {
    vaultName: () => 'Vault café', windows: false, extension: 'url',
    file: path => path === file ? { markdown: true, verify: () => {
      if (fileMoved) throw new Error('The target file changed.');
    } } : path === 'menu.csv' ? { markdown: false, verify: () => {} } : undefined,
    folder: path => path === '' || path === 'Meals (2026)' ? () => {} : undefined,
    verifyVaultId: () => { throw new Error('The official CLI is unavailable.'); },
    prepareIcon: () => Promise.resolve(() => { iconWrites++; return Promise.resolve(undefined); }),
    creator: () => ({
      async createShortcut(request, label, options, context) {
        const path = await writeRequestShortcut(desktop, 'url', request, label, options, context);
        if (iconFailure) throw new ShortcutIconError(path, 'Fixture metadata failure');
        return path;
      },
      createVaultShortcut: () => { throw new Error('Use the structured creator.'); },
      createNoteShortcut: () => { throw new Error('Use the structured creator.'); },
      createTagShortcut: () => { throw new Error('Use the structured creator.'); },
    }),
  };
  const profile = '.profile-test/plugins/vault-shortcuts';
  const windows = process.platform === 'win32';
  const path = await mailboxPath(root, profile, windows, home);
  assert.notEqual(path, await mailboxPath(root, '.profile-other/plugins/vault-shortcuts', windows, home));
  const mailbox = new AgentMailbox(() => Promise.resolve(path), agentShortcutHandler(host));
  try {
    await mailbox.prepare();
    await mailbox.test(() => {});
    const send = async (operation: AgentOperation, data?: object) => {
      const id = await stage(path, operation, data);
      await mailbox.receive(id, () => {});
      return result(path, id);
    };
    assert.equal((await send('help')).ok, true);
    const request = { action: 'new', mode: 'replace', file, name: 'Packing list' };
    const uri = 'obsidian://new?vault=Vault%20caf%C3%A9&file=Packing%20list%20Caf%C3%A9.md&overwrite=true&clipboard=true';
    assert.deepEqual(await send('preview', request), { ok: true, uri, destination: 'desktop', filename: 'Packing list.url',
      launchEffect: 'When launched, replaces the target note’s contents. Repeated launches repeat the write.' });
    assert.equal(iconWrites, 0);
    assert.deepEqual(await readdir(desktop), []);
    assert.equal((await send('preview', { action: 'open', file: 'menu.csv' })).ok, true);
    assert.equal((await send('create', { ...request, file: 'menu.csv' })).ok, false);
    assert.equal((await send('create', { ...request, file: '../outside.md' })).ok, false);
    assert.equal((await send('create', { ...request, vault: 'Other' })).ok, false);
    assert.equal((await send('create', { ...request, destination: 'start-menu' })).ok, false);
    assert.equal((await send('create', { ...request, vaultId: '1234567890abcdef' })).ok, false);
    assert.equal((await send('create', { ...request, content: { kind: 'text', text: 2 } })).ok, false);
    assert.match(String((await send('create', { ...request, content: { kind: 'text', text: 'a'.repeat(65_536) } })).error), /64 KiB/);
    assert.equal((await send('preview', { action: 'daily' })).ok, true);
    assert.equal((await send('preview', { action: 'new', folder: 'Meals (2026)' })).ok, true);
    assert.equal((await send('preview', { action: 'search', folder: 'Meals (2026)' })).ok, true);
    fileMoved = true;
    assert.equal((await send('create', request)).ok, false);
    fileMoved = false;
    const first = join(desktop, 'Packing list.url');
    const second = join(desktop, 'Packing list (2).url');
    assert.equal((await send('create', request)).ok, true);
    const created = await send('create', request);
    assert.equal(created.path, second);
    assert.equal(created.uri, uri);
    assert.match(await readFile(first, 'utf8'), /overwrite=true&clipboard=true/);
    assert.deepEqual(await readFile(second), await readFile(first));
    iconFailure = true;
    const partial = await send('create', request);
    assert.equal(partial.ok, false);
    assert.equal(partial.path, join(desktop, 'Packing list (3).url'));
    assert.equal(await readFile(join(root, file), 'utf8'), '# Original');
    assert.equal(iconWrites, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('request IDs are private, vault-bound, single-use and expire', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-shortcuts-handoff-'));
  const left = join(directory, 'left');
  const right = join(directory, 'right');
  await Promise.all([mkdir(left, { mode: 0o700 }), mkdir(right, { mode: 0o700 })]);
  const one = join(left, 'Requests');
  const two = join(right, 'Requests');
  let calls = 0;
  const handle = () => { calls++; return Promise.resolve({ ok: true }); };
  const mailbox = new AgentMailbox(() => Promise.resolve(one), handle);
  const anotherWindow = new AgentMailbox(() => Promise.resolve(one), handle);
  const wrongVault = new AgentMailbox(() => Promise.resolve(two), handle);
  try {
    await Promise.all([mailbox.prepare(), wrongVault.prepare()]);
    const id = await stage(one, 'create', { action: 'open' });
    await wrongVault.receive(id, () => {});
    await mailbox.receive(`../${id}`, () => {});
    assert.equal(calls, 0);
    const receive = [mailbox, anotherWindow].map(target => target.receive(id, () => {}));
    await Promise.all(receive);
    assert.equal((await result(one, id)).ok, true);
    await mailbox.receive(id, () => {});
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(two), []);
    const expired = await stage(one, 'create', { action: 'open' });
    await utimes(join(one, expired, 'request.json'), new Date(0), new Date(0));
    await mailbox.receive(expired, () => {});
    assert.match(String((await result(one, expired)).error), /expired/);
    const disabled = await stage(one, 'create', { action: 'open' });
    await mailbox.receive(disabled, () => { throw new Error('Disabled'); });
    assert.equal((await result(one, disabled)).error, 'Disabled');
    const existingResult = await stage(one, 'create', { action: 'open' });
    const resultFile = join(one, existingResult, 'result.json');
    await writeFile(resultFile, 'Preserve this result', { mode: 0o600 });
    await mailbox.receive(existingResult, () => {});
    assert.equal(await readFile(resultFile, 'utf8'), 'Preserve this result');
    await assert.rejects(readFile(join(one, existingResult, 'ready')), { code: 'ENOENT' });
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
