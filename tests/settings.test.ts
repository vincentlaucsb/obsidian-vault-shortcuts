import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readContextMenuOptions, readDefaultIcon } from '../src/settings';

void test('context menu options default enabled and preserve explicit false values', () => {
  for (const data of [undefined, null, 'bad', { desktop: 'false', startMenu: 0, tags: 'false' }]) {
    assert.deepEqual(readContextMenuOptions(data), { desktop: true, startMenu: true, tags: true });
  }
  assert.deepEqual(readContextMenuOptions({ desktop: false }), { desktop: false, startMenu: true, tags: true });
  assert.deepEqual(readContextMenuOptions({ desktop: true, startMenu: false }), { desktop: true, startMenu: false, tags: true });
  assert.deepEqual(readContextMenuOptions({ tags: false }), { desktop: true, startMenu: true, tags: false });
});

void test('default icon settings reject unexpected stored types', () => {
  for (const data of [undefined, null, 'icon.ico', { defaultIcon: false }, { defaultIcon: 7 }, { defaultIcon: '' }]) {
    assert.equal(readDefaultIcon(data), undefined);
  }
  assert.equal(readDefaultIcon({ defaultIcon: 'C:\\Icons\\recipe.ico' }), 'C:\\Icons\\recipe.ico');
});
