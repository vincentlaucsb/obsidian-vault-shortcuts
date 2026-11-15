import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeVaultId } from '../src/shortcuts/requests';
import { checkVaultIdentityPath, verifyVaultId } from '../src/vaultIdentity';

void test('vault IDs normalize pasted whitespace/case and reject names or command arguments', () => {
  assert.equal(normalizeVaultId(' ABCDEF1234567890\n'), 'abcdef1234567890');
  for (const value of ['', 'Recipes', 'not-a-vault-uuid', '1234567890abcdef\ninfo=path', 'vault=1234567890abcdef']) {
    assert.throws(() => normalizeVaultId(value), /16-character/);
  }
});

void test('ID verification matches canonical vault folders and rejects unrelated or ambiguous CLI output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-vault-id-'));
  try {
    const current = join(directory, 'Current 雪');
    const other = join(directory, 'Other');
    await Promise.all([mkdir(current), mkdir(other)]);
    const output = await realpath(current);
    await checkVaultIdentityPath(output + '\r\n', current, process.platform === 'win32');
    await checkVaultIdentityPath('2026-11-11 10:00:00 Loading app package test.asar\n' + output, current, process.platform === 'win32');
    await assert.rejects(checkVaultIdentityPath(other, current, process.platform === 'win32'), /different vault/);
    for (const invalid of ['Vault not found.', '', 'relative/path', output + '\n' + other, output + '\u0000']) {
      await assert.rejects(checkVaultIdentityPath(invalid, current, process.platform === 'win32'), /did not return a vault path/);
    }
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '';
      await assert.rejects(verifyVaultId('1234567890abcdef', current, false), /Could not verify.*CLI.*Name mode/s);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
