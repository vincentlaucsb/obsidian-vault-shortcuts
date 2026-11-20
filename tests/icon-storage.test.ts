import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

function isHarness(value: unknown): value is { run: (directory: string) => Promise<void> } {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function';
}

void test('icon deduplication retries busy publication reads and preserves other failures and immutable assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-icon-storage-'));
  try {
    const output = join(directory, 'storage.cjs');
    await build({ stdin: {
      contents: 'import {storePngIcon} from "./src/icons/assets"; import {runIconStorageScenarios} from "./tests/icon-storage-fixture"; export const run = (directory: string): Promise<void> => runIconStorageScenarios(storePngIcon, directory);',
      resolveDir: resolve('.'), loader: 'ts',
    }, bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'icon-storage-boundary', setup(context) {
      context.onResolve({ filter: /^node:fs\/promises$/ }, args => {
        if (args.importer.endsWith('assets.ts')) return { path: resolve('tests/icon-storage-fixture.ts') };
        return undefined;
      });
    } }] });
    const loaded: unknown = createRequire(import.meta.url)(output);
    if (!isHarness(loaded)) throw new Error('Invalid icon storage harness');
    await loaded.run(join(directory, 'assets'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
