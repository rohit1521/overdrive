import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { configure } from '../i18n/core.js';
import { shapeOf, shownFormat } from '../downloads/format.js';
import { FORMAT_FILTERS, formatLabel, matchesFormat, releaseFormat } from './source-format.js';
import { scanDrive, totals } from '../files/scan.js';
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

test('format filters distinguish PKG, Dump, exFAT, Package and Archive with archive overlap', () => {
  assert.deepEqual(FORMAT_FILTERS.map(formatLabel), ['All Formats', 'PKG', 'Dump', 'exFAT', 'Package', 'Archive']);
  assert.ok(matchesFormat({ format: 'exfat' }, 'exfat'));
  assert.ok(matchesFormat({ format: 'ffpkg' }, 'package'));
  assert.ok(matchesFormat({ format: 'ffpfsc' }, 'package'));
  assert.ok(!matchesFormat({ format: 'fpkg' }, 'package'));
  assert.ok(matchesFormat({ format: 'fpkg' }, 'pkg'));
  assert.ok(matchesFormat({ format: 'pkg' }, 'pkg'));
  assert.ok(matchesFormat({ filename: 'game.tar.gz' }, 'archives'));
  for (const format of ['zip', 'rar', '7z']) {
    assert.ok(matchesFormat({ format }, 'dump'));
    assert.ok(matchesFormat({ format }, 'archives'));
  }
  assert.ok(matchesFormat({ format: 'folder-dump' }, 'dump'));
  assert.ok(matchesFormat({ format: 'binary' }, 'exfat', { format: 'exfat' }));
  const set = { parts: [{ sources: [{ format: 'binary' }] }] };
  assert.ok(matchesFormat(set, 'archives'));
  assert.ok(matchesFormat(set, 'dump'));
  assert.ok(matchesFormat({ format: 'binary' }, 'all'));
  assert.ok(!matchesFormat({ format: 'binary' }, 'package'));
  assert.ok(matchesFormat({ format: 'zip' }, 'pkg', { containedFormats: ['pkg'] }));
  assert.ok(matchesFormat({ format: 'rar' }, 'package', { containedFormats: ['ffpfsc'] }));
  assert.equal(releaseFormat({ format: 'archive-set' }), null);
});

function filesystem(entries) {
  return {
    exists: (path) => Object.hasOwn(entries, path),
    stat: (path) => path === '/data' ? { isDirectory: true } : null,
    readDir(path) {
      if (entries[path] instanceof Error) throw entries[path];
      return entries[path] || [];
    }
  };
}

test('file scanning is deferred, incremental and preserves sizes and sort order', async () => {
  let yields = 0;
  const children = Array.from({ length: 140 }, (_, index) => ({ name: `file${index}`, size: 2 }));
  const fs = filesystem({
    '/data/homebrew': [{ name: 'PPSA00001', isDirectory: true }, { name: 'PPSA00002.exfat', size: 100 }],
    '/data/homebrew/PPSA00001': children
  });
  const result = await scanDrive(fs, '/data', { wait: async () => { yields++; } });
  assert.ok(yields >= 3);
  assert.equal(result.partial, false);
  assert.equal(result.files[0].titleId, 'PPSA00001');
  assert.equal(result.files[0].size, 280);
  assert.equal(result.files[0].approximate, false);
  assert.equal(totals(result.files).all.size, 380);
});

test('one global 4000-entry budget bounds scans across many game folders', async () => {
  const data = { '/data/homebrew': Array.from({ length: 10 }, (_, i) => ({ name: `game${i}`, isDirectory: true })) };
  for (let i = 0; i < 10; i++) data[`/data/homebrew/game${i}`] = Array.from({ length: 4001 }, (_, j) => ({ name: `file${j}`, size: 1 }));
  const result = await scanDrive(filesystem(data), '/data', { wait: async () => {} });
  assert.equal(result.visited, 4000);
  assert.equal(result.partial, true);
  assert.equal(result.files.length, 10);
  assert.ok(result.files.every((file) => file.approximate));
  assert.ok(totals(result.files, result.partial).all.approximate);
});

test('file scan cancellation stops before accessing another batch', async () => {
  const cancel = cancellation();
  let yields = 0;
  const fs = filesystem({ '/data/homebrew': Array.from({ length: 200 }, (_, i) => ({ name: `game${i}.exfat`, size: 1 })) });
  await assert.rejects(scanDrive(fs, '/data', { signal: cancel.signal, wait: async () => {
    if (++yields === 2) cancel.cancel();
  } }), /cancelled/);
  assert.equal(yields, 2);
});

test('unreadable folders and depth-limited sizes are explicitly partial', async (context) => {
  context.mock.method(console, 'log', () => {});
  const fs = filesystem({
    '/data/homebrew': [{ name: 'broken', isDirectory: true }, { name: 'deep', isDirectory: true }],
    '/data/homebrew/broken': new Error('permission denied'),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) =>
      [`/data/homebrew/deep${'/deep'.repeat(i)}`, [{ name: 'deep', isDirectory: true }]]))
  });
  const result = await scanDrive(fs, '/data', { wait: async () => {} });
  assert.ok(result.partial);
  assert.equal(result.errors.length, 1);
  assert.ok(result.files.every((file) => file.approximate));
});

test('missing storage is an error rather than a successful empty scan', async () => {
  await assert.rejects(scanDrive(filesystem({}), '/gone', { wait: async () => {} }), /Storage is unavailable/);
});

test('batch UI strings and manual-update links are present in every locale', () => {
  const directory = new URL('../i18n/locales/', import.meta.url);
  for (const name of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const messages = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    for (const key of ['sources.formatAll', 'sources.formatPreference', 'sources.formatFilter', 'sources.noFormatMatch',
      'torbox.preparing', 'files.scanProgress', 'files.scanPartial', 'files.scanFailed', 'files.rescan']) {
      assert.ok(messages[key], `${name}: ${key}`);
    }
    assert.ok(messages['torbox.preparing'].includes('{percent}'));
    assert.ok(messages['files.scanProgress'].includes('{count}'));
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
