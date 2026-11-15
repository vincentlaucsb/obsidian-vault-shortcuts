import assert from 'node:assert/strict';
import { lstat as nativeLstat, readFile as nativeReadFile, readdir, writeFile as nativeWriteFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transparentPng } from './png-fixture';

export { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises';

let failure = new Error('Unconfigured filesystem failure');
let remaining = 0;
let reads = 0;
let busyStat = false;

export async function lstat(path: string): Promise<Awaited<ReturnType<typeof nativeLstat>>> {
  if (busyStat && path.endsWith('.png')) {
    busyStat = false;
    throw Object.assign(new Error('Destination busy'), { code: 'EBUSY' });
  }
  return nativeLstat(path);
}

export async function readFile(path: string): Promise<Buffer> {
  reads++;
  if (remaining-- > 0) throw failure;
  return nativeReadFile(path);
}

export async function runIconStorageScenarios(store: (input: Uint8Array, platform: 'linux', directory: string) => Promise<string>, directory: string): Promise<void> {
  const data = transparentPng(512);
  const destination = await store(data, 'linux', directory);
  failure = Object.assign(new Error('Destination busy'), { code: 'EBUSY' });
  remaining = 1;
  reads = 0;
  busyStat = true;
  assert.equal(await store(data, 'linux', directory), destination);
  assert.equal(reads, 2, 'Busy metadata and reads are retried before verifying identical bytes');
  assert.deepEqual(await nativeReadFile(destination), data);

  remaining = 10;
  reads = 0;
  await assert.rejects(store(data, 'linux', directory), error => error === failure);
  assert.equal(reads, 5, 'Persistent busy errors stop at the existing bounded retry limit');

  failure = Object.assign(new Error('Access denied'), { code: 'EACCES' });
  remaining = 10;
  reads = 0;
  await assert.rejects(store(data, 'linux', directory), error => error === failure);
  assert.equal(reads, 1, 'Nontransient read failures are preserved without retry');

  remaining = 0;
  await nativeWriteFile(destination, 'damaged');
  await assert.rejects(store(data, 'linux', directory), /damaged/);
  assert.equal(await nativeReadFile(destination, 'utf8'), 'damaged', 'Never overwrite damaged immutable assets');
  assert.deepEqual((await readdir(directory)).map(file => join(directory, file)), [destination], 'Every failure removes its own temporary file');
}
