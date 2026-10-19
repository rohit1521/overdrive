import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { configure, setLocale } from '../i18n/core.js';
import { releaseSets } from '../state/release-sets.js';
import { sourceFormat } from './source-format.js';

const localesDir = new URL('../i18n/locales/', import.meta.url);
const messages = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, localesDir), 'utf8'));
configure(messages, messages('en'));

test('shows exact declared extensions, preserving package and image distinctions', () => {
  for (const format of ['zip', 'rar', '7z', 'exfat', 'ffpfsc', 'ffpfs', 'ffpkg', 'pkg', 'fpkg',
    'tar', 'tar.gz', 'tgz', 'tar.bz2', 'tar.xz', 'tar.zst']) {
    assert.equal(sourceFormat({ format }), `.${format.toUpperCase()}`);
  }
  assert.equal(sourceFormat({ format: '.ZIP' }), '.ZIP');
  assert.equal(sourceFormat({ format: 'pkg', filename: 'game.zip' }), '.PKG');
});

test('uses known filenames when metadata is absent or only binary', () => {
  assert.equal(sourceFormat({ filename: 'Game.EXFAT' }), '.EXFAT');
  assert.equal(sourceFormat({ format: 'binary', filename: 'Game.fpkg' }), '.FPKG');
  assert.equal(sourceFormat({ format: 'binary', filename: 'Game.tar.gz' }), '.TAR.GZ');
  assert.equal(sourceFormat({ filename: 'Game.7z.001' }), '.7Z');
  assert.equal(sourceFormat({ filename: 'Game.part01.rar' }), '.RAR');
});

test('recognizes filenames in direct, encoded, and host-page URLs without a request', () => {
  for (const [url, expected] of [
    ['https://example.com/Game.exfat?token=123#download', '.EXFAT'],
    ['https://example.com/Game%20name%2Ezip', '.ZIP'],
    ['https://www.mediafire.com/file/id/Game.part1.rar/file', '.RAR'],
    ['https://www.mediafire.com/file/id/Game.7z/file/', '.7Z'],
    ['https://rapidgator.net/file/id/Game.rar.html', '.RAR'],
    ['https://example.com/Game.tar.xz', '.TAR.XZ'],
    ['https://example.com/Game.zip.001', '.ZIP']
  ]) {
    assert.equal(sourceFormat({ format: 'binary', filename: 'placeholder.binary', url }), expected);
    assert.equal(sourceFormat({ browserUrl: url }), expected);
  }
});

test('does not guess from a host, a query, a directory, or the contents of an archive', () => {
  for (const release of [
    undefined,
    {},
    { format: 'binary', filename: 'game.binary', url: 'https://vikingfile.com/f/opaque' },
    { url: 'https://example.com/page?next=Game.zip' },
    { url: 'https://example.com/Game.pkg/opaque' },
    { url: 'https://example.com/Game.zip.exe' },
    { url: 'https://game.zip' },
    { label: 'PS5 FPKG in archive', filename: 'game.bin' },
    { format: 'archive-set' }
  ]) assert.equal(sourceFormat(release), 'Unknown format');
  assert.equal(sourceFormat({ format: 'zip', label: 'EXFAT image inside' }), '.ZIP');
});

test('reports malformed URL encoding explicitly and keeps the format unknown', (context) => {
  const log = context.mock.method(console, 'log', () => {});
  assert.equal(sourceFormat({ url: 'https://example.com/Game%ZZ.zip' }), 'Unknown format');
  assert.equal(log.mock.calls.length, 1);
  assert.match(log.mock.calls[0].arguments[0], /invalid URL encoding/);
});

test('reads the original source metadata of grouped multipart releases', () => {
  const records = [1, 2].map((number) => ({
    id: `release-${number}`,
    record: 'release',
    format: 'binary',
    filename: 'placeholder.binary',
    provider: 'MediaFire',
    label: `Base part ${number}`,
    url: `https://www.mediafire.com/file/id/Game.part${number}.rar/file`
  }));
  const [group] = releaseSets(records);
  assert.equal(group.format, 'archive-set');
  assert.equal(sourceFormat(group), '.RAR');
});

test('does not promise a single format for unknown or conflicting multipart sources', () => {
  const group = (...formats) => ({
    format: 'archive-set',
    parts: formats.map((format) => ({ sources: [{ format }] }))
  });
  assert.equal(sourceFormat(group('rar', 'rar')), '.RAR');
  assert.equal(sourceFormat(group('binary', 'binary')), 'Unknown format');
  assert.equal(sourceFormat(group('rar', 'binary')), 'Unknown format');
  assert.equal(sourceFormat(group('rar', 'zip')), 'Unknown format');
  assert.equal(sourceFormat({ parts: [{ sources: [] }] }), 'Unknown format');
  assert.equal(sourceFormat({ parts: [{ sources: [{ format: 'rar' }, { format: 'zip' }] }] }), 'Unknown format');
});

test('all shipped locales provide the unknown-format label', () => {
  for (const file of readdirSync(localesDir).filter((file) => file.endsWith('.json'))) {
    const code = file.slice(0, -5);
    const label = messages(code)['sources.format.unknown'];
    assert.equal(typeof label, 'string', code);
    assert.ok(label.length > 0, code);
    setLocale(code);
    assert.equal(sourceFormat({ format: 'binary' }), label, code);
    assert.equal(sourceFormat({ format: 'exfat' }), '.EXFAT', code);
  }
  setLocale('en');
});
