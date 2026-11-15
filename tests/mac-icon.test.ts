import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

function isHarness(value: unknown): value is { run: () => Promise<void> } {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function';
}

void test('macOS icon application: native argv, bounded process, preflight and partial-failure reporting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-mac-icon-'));
  try {
    const output = join(directory, 'mac.cjs');
    await build({ stdin: {
      contents: 'import {createMacShortcutWithIcon} from "./src/shortcuts/macIcon"; import {runMacIconScenarios} from "./tests/mac-icon-fixture"; export const run = () => runMacIconScenarios(createMacShortcutWithIcon);',
      resolveDir: resolve('.'), loader: 'ts',
    }, bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'native-mac-boundary', setup(context) {
      context.onResolve({ filter: /^node:fs\/promises$|^node:child_process$/ }, args => {
        if (args.importer.endsWith('macIcon.ts')) return { path: resolve('tests/mac-icon-fixture.ts') };
        return undefined;
      });
    } }] });
    const loaded: unknown = createRequire(import.meta.url)(output);
    if (!isHarness(loaded)) throw new Error('Invalid macOS test harness');
    await loaded.run();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
