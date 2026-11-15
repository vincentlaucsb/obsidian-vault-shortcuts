import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

void test('release metadata agrees and the directory description omits redundant branding', async () => {
  const manifest = await json('manifest.json');
  assert.ok(typeof manifest === 'object' && manifest !== null);
  assert.ok('description' in manifest && typeof manifest.description === 'string');
  assert.ok(!/obsidian/i.test(manifest.description), 'Directory descriptions must omit Obsidian.');
  assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
  assert.ok('version' in manifest && typeof manifest.version === 'string');
  assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.ok('minAppVersion' in manifest && typeof manifest.minAppVersion === 'string');
  assert.ok('isDesktopOnly' in manifest && manifest.isDesktopOnly === true);
  for (const path of ['package.json', 'package-lock.json']) {
    const data = await json(path);
    assert.ok(typeof data === 'object' && data !== null && 'version' in data);
    assert.equal(data.version, manifest.version, path);
    if (path === 'package-lock.json') {
      assert.ok('packages' in data && typeof data.packages === 'object' && data.packages !== null);
      assert.ok('' in data.packages);
      const root = data.packages[''];
      assert.ok(typeof root === 'object' && root !== null && 'version' in root);
      assert.equal(root.version, manifest.version);
    }
  }
  const versions = await json('versions.json');
  assert.ok(typeof versions === 'object' && versions !== null);
  assert.equal(Object.getOwnPropertyDescriptor(versions, manifest.version)?.value, manifest.minAppVersion);
});
