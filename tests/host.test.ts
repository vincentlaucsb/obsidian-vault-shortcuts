import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

function isHarness(value: unknown): value is { run: () => Promise<void> } {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function';
}

void test('mock host: clicked-note targeting, duplicate menus, stale files and OS dispatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-shortcut-host-test-'));
  try {
    const output = join(directory, 'host.cjs');
    const fixture = resolve('tests/host-fixture.ts');
    await build({
      stdin: {
        contents: 'import Main from "./src/main"; import { OtherVaultModal } from "./src/OtherVaultModal"; import { TagShortcutModal } from "./src/TagShortcutModal"; import {runScenarios} from "./tests/host-fixture"; import {runModalScenarios, runTagModalScenarios} from "./tests/modal-fixture"; export const run = async () => { await runScenarios(() => new Main()); await runModalScenarios(create => new OtherVaultModal({}, create)); await runTagModalScenarios(create => new TagShortcutModal({}, ["#work"], create)); };',
        resolveDir: resolve('.'), loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'cjs', outfile: output,
      plugins: [{
        name: 'mock-host',
        setup(buildContext) {
          buildContext.onResolve({ filter: /^\.\/vaultDiscovery$/ },
            () => ({ path: resolve('tests/modal-fixture.ts') }));
          buildContext.onResolve({ filter: /^obsidian$|^\.\/WindowsShortcutCreator$|^\.\/MacOSShortcutCreator$|^\.\/LinuxShortcutCreator$/ },
            () => ({ path: fixture }));
        },
      }],
    });
    const loaded: unknown = createRequire(import.meta.url)(output);
    if (!isHarness(loaded)) throw new Error('Invalid test harness exports.');
    await loaded.run();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
