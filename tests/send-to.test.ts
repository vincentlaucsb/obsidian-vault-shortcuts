import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCaptureFolder, readImageRequest } from '../src/sendTo/importImage';
import { readSendToFolder } from '../src/settings';

void test('Send to saves only vault-relative folder paths and uses the root by default', () => {
  assert.equal(readCaptureFolder(readSendToFolder(undefined)), '');
  assert.equal(readCaptureFolder(readSendToFolder({ sendToFolder: '  Meals\\Desserts\\  ' })), 'Meals/Desserts');
  for (const input of ['C:\\outside', '../outside', 'Meals/../outside', '/Meals', 'Meals//Desserts']) {
    assert.throws(() => readCaptureFolder(input), /path relative to this vault/);
  }
});

void test('Send to accepts only a known capture action and a local Windows file path', () => {
  assert.deepEqual(readImageRequest({ mode: 'daily', source: "C:\\Photos\\Café & 'pie'.png" }),
    { mode: 'daily', source: "C:\\Photos\\Café & 'pie'.png" });
  for (const input of [{ mode: 'other', source: 'C:\\Photo.png' }, { mode: 'new', source: 'relative.png' },
    { mode: 'new', source: '\\\\server\\Photo.png' }, { mode: 'new', source: 'C:\\Photo.png:stream' },
    { mode: 'new', source: 'C:\\Photo.png\nnext' }]) {
    assert.throws(() => readImageRequest(input), /Select a local image/);
  }
});
