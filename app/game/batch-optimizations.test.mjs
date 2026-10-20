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
