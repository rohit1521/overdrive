import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { configure } from '../i18n/core.js';
configure(() => JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8')));
import { UPDATE_FEED } from '../version.js';
test('updates default to our fork rather than upstream', () => {
  assert.equal(UPDATE_FEED, 'https://api.github.com/repos/rohit1521/overdrive/releases/latest');
  const source = readFileSync(new URL('../state/update.js', import.meta.url), 'utf8');
  assert.ok(source.includes(': UPDATE_FEED'));
  assert.ok(!source.includes('repos/MyLuxy/overdrive'));
});
import { shapeOf, shownFormat } from '../downloads/format.js';
test('detected formats invalidate rows but progress counters do not', () => {
  const job = { id: 'a', state: 'downloading', total: 100, release: { format: 'binary' }, artifact: { format: 'binary' } };
  const before = shapeOf(job);
  assert.notEqual(before, shapeOf({ ...job, inspected: 'exfat' }));
  assert.notEqual(before, shapeOf({ ...job, fileName: 'game.pkg' }));
  assert.notEqual(before, shapeOf({ ...job, artifact: { format: 'zip' } }));
  assert.equal(before, shapeOf({ ...job, written: 50, bytesPerSecond: 10, received: 70 }));
  assert.equal(shownFormat({ ...job, inspected: 'exfat' }), 'exfat');
  assert.notEqual(before, shapeOf({ ...job, message: 'TorBox preparing: 50%' }));
});
