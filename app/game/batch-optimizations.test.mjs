import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { configure } from '../i18n/core.js';
import { shapeOf, shownFormat } from '../downloads/format.js';
import { matchesFormat, releaseFormat } from './source-format.js';
import { cancellation } from '../state/download-sources.js';
import { UPDATE_FEED } from '../version.js';

configure(() => JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8')));

test('updates default to our fork rather than upstream', () => {
  assert.equal(UPDATE_FEED, 'https://api.github.com/repos/rohit1521/overdrive/releases/latest');
  const source = readFileSync(new URL('../state/update.js', import.meta.url), 'utf8');
  assert.ok(source.includes(': UPDATE_FEED'));
  assert.ok(!source.includes('repos/MyLuxy/overdrive'));
});

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

test('format filters distinguish images, packages, archives and unknown records', () => {
  assert.ok(matchesFormat({ format: 'exfat' }, 'exfat'));
  assert.ok(matchesFormat({ format: 'ffpkg' }, 'images'));
  assert.ok(!matchesFormat({ format: 'fpkg' }, 'images'));
  assert.ok(matchesFormat({ format: 'fpkg' }, 'packages'));
  assert.ok(matchesFormat({ filename: 'game.tar.gz' }, 'archives'));
  assert.ok(matchesFormat({ format: 'binary' }, 'exfat', { format: 'exfat' }));
  const set = { parts: [{ sources: [{ format: 'binary' }] }] };
  assert.ok(matchesFormat(set, 'archives'));
  assert.ok(!matchesFormat(set, 'unknown'));
  assert.ok(matchesFormat({ format: 'binary' }, 'unknown'));
  assert.equal(releaseFormat({ format: 'archive-set' }), null);
});

test('batch UI strings and manual-update links are present in every locale', () => {
  const directory = new URL('../i18n/locales/', import.meta.url);
  for (const name of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const messages = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    for (const key of ['sources.formatAll', 'sources.formatPreference', 'sources.formatFilter', 'sources.noFormatMatch',
      'torbox.preparing']) {
      assert.ok(messages[key], `${name}: ${key}`);
    }
    assert.ok(messages['torbox.preparing'].includes('{percent}'));
    assert.ok(messages['update.replaceByHand'].includes('rohit1521/overdrive'), name);
  }
});

const savedFiles = new Map([['/test/overdrive/settings.json', JSON.stringify({ language: 'en' })]]);
globalThis.__batchPreferenceFs = {
  dataDir: '/test', exists: (path) => savedFiles.has(path), readFile: (path) => savedFiles.get(path),
  mkdir() {}, writeFile: (path, data) => savedFiles.set(path, data),
  rename: (from, to) => { savedFiles.set(to, savedFiles.get(from)); savedFiles.delete(from); }
};
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === '@ps5-react/core') return { shortCircuit: true, url:
      'data:text/javascript,export const DeviceInfo={get:()=>({})}, FileSystem=globalThis.__batchPreferenceFs;' };
    if (specifier === 'react') return { shortCircuit: true, url:
      'data:text/javascript,export const useEffect=()=>{},useState=()=>{};' };
    return next(specifier, context);
  }
`)}`, import.meta.url);
const { preferredRelease } = await import('./sources.js');
const preference = await import('../state/source-preference.js');

test('format preferences are persisted without dropping other settings', async () => {
  preference.setSourcePreference('exfat');
  assert.equal(preference.sourcePreference(), 'exfat');
  assert.deepEqual(JSON.parse(savedFiles.get('/test/overdrive/settings.json')), { language: 'en', sourceFormat: 'exfat' });
  const reopened = await import('../state/source-preference.js?reopened');
  assert.equal(reopened.sourcePreference(), 'exfat');
});

test('recommendations prefer the requested format without recommending patches over full games', () => {
  const archive = { id: 'archive', format: 'zip', provider: 'archive.org', url: 'https://archive.org/download/game.zip' };
  const image = { id: 'image', format: 'exfat', provider: 'VikingFile', url: 'https://vikingfile.com/f/file' };
  assert.equal(preferredRelease([archive, image]), 0);
  assert.equal(preferredRelease([archive, image], 'exfat'), 1);
  assert.equal(preferredRelease([archive, { ...image, label: 'backport files' }], 'exfat'), 0);
});
