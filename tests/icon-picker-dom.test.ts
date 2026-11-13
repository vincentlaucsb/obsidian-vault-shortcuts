import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

function isHarness(value: unknown): value is { run: () => Promise<void> } {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function';
}

void test('real icon control uses an attached popout picker, preserves cancellation and resizes rectangles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shortcut-picker-dom-'));
  try {
    const output = join(directory, 'picker.cjs');
    const fixture = resolve('tests/icon-picker-dom-fixture.ts');
    await build({
      stdin: {
        contents: 'import { addIconControl } from "./src/IconControl"; import { runPickerScenarios } from "./tests/icon-picker-dom-fixture"; export const run = () => runPickerScenarios(addIconControl);',
        resolveDir: resolve('.'), loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'cjs', outfile: output,
      plugins: [{ name: 'owner-window-dom', setup(context) {
        context.onResolve({ filter: /^obsidian$|^\.\/icons$|^node:fs\/promises$/ }, () => ({ path: fixture }));
      } }],
    });
    const loaded: unknown = createRequire(import.meta.url)(output);
    if (!isHarness(loaded)) throw new Error('Invalid picker test harness');
    await loaded.run();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
