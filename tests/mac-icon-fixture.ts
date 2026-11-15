import assert from 'node:assert/strict';
import { transparentPng } from './png-fixture';

const png = transparentPng(512);
let fail = false;
let ended = false;
const calls: { executable: string; args: readonly string[]; timeout: number }[] = [];

export function access(): Promise<void> { return Promise.resolve(); }
export function stat(path: string): Promise<{ size: number }> {
  return path.includes('missing') ? Promise.reject(new Error('Missing image')) : Promise.resolve({ size: png.length });
}
export function readFile(): Promise<Buffer> { return Promise.resolve(png); }
export function execFile(executable: string, args: readonly string[], options: { timeout: number; windowsHide: boolean; maxBuffer: number },
  callback: (error: Error | null) => void): { stdin: { on: () => void; end: () => void } } {
  assert.equal(options.windowsHide, true); assert.equal(options.maxBuffer, 16384);
  calls.push({ executable, args, timeout: options.timeout });
  queueMicrotask(() => { callback(fail ? new Error('Native failure') : null); });
  return { stdin: { on: () => {}, end: () => { ended = true; } } };
}

export async function runMacIconScenarios(createWithIcon: (write: () => Promise<string>, icon?: string) => Promise<string>): Promise<void> {
  let created = 0;
  const destination = '/Users/test/Desktop/Recipes.url';
  const write = (): Promise<string> => { created++; return Promise.resolve(destination); };
  assert.equal(await createWithIcon(write), destination);
  assert.equal(calls.length, 0, 'Standard shortcuts do not invoke a subprocess');
  assert.equal(await createWithIcon(write, '/Users/test/Icons/soup.png'), destination);
  assert.equal(ended, true, 'The native helper receives EOF');
  assert.equal(calls[0].executable, '/usr/bin/osascript'); assert.equal(calls[0].timeout, 10000);
  assert.deepEqual(calls[0].args.slice(-2), ['/Users/test/Icons/soup.png', destination]);
  const beforeMissing = created;
  await assert.rejects(createWithIcon(write, '/Users/test/Icons/missing.png'), /Missing image/);
  assert.equal(created, beforeMissing, 'Missing images fail before writing a shortcut');
  fail = true;
  await assert.rejects(createWithIcon(write, '/Users/test/Icons/soup.png'), /Shortcut created at.*Recipes.url.*shortcut was kept.*Native failure/);
  assert.equal(created, beforeMissing + 1, 'A metadata failure reports the already-created shortcut');
}
