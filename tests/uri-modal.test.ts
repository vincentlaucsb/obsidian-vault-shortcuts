import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

function isHarness(value: unknown): value is { run: () => Promise<void> } {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function';
}

void test('production URI dialog: active fields, preview/copy, bound contexts and async lifecycle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-uri-modal-'));
  try {
    const output = join(directory, 'modal.cjs');
    const fixture = resolve('tests/uri-modal-fixture.ts');
    await build({
      stdin: {
        contents: 'import { ShortcutOptionsModal } from "./src/ShortcutOptionsModal"; import { runUriModalScenarios } from "./tests/uri-modal-scenarios"; export const run = () => runUriModalScenarios(options => new ShortcutOptionsModal({}, options));',
        resolveDir: resolve('.'), loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'cjs', outfile: output,
      plugins: [{ name: 'native-controls', setup(context) {
        context.onResolve({ filter: /^obsidian$|^\.\/IconControl$|^\.\/vaultDiscovery$/ }, () => ({ path: fixture }));
      } }],
    });
    const loaded: unknown = createRequire(import.meta.url)(output);
    if (!isHarness(loaded)) throw new Error('Invalid URI modal test harness');
    await loaded.run();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
