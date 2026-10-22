import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { configure } from '../i18n/core.js';
import { createTorBoxHosts } from '../state/torbox-hosts.js';
import { withTorBox } from '../state/torbox.js';
import { BrowserRequired } from '../state/download-sources.js';
import { downloadMeta, shapeOf } from '../downloads/format.js';

configure(() => JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8')));
const source = (url) => ({ url, provider: 'VikingFile', filename: 'game.binary', requiresBrowser: true });
const viking = source('https://vikingfile.com/f/example123');
const data = [
  { name: 'VikingFile', status: true, domains: ['vikingfile.com', 'vik1ngfile.site'] },
  { name: 'DataNodes', status: true, domains: ['datanodes.to'] },
  { name: 'Offline', status: false, domains: ['offline.example'] }
];
const response = (data) => ({ ok: true, json: async () => ({ success: true, data }) });

test('host support uses actual URL domains and aliases, not provider labels or wrapper fragments', async () => {
  const policy = createTorBoxHosts({ http: { request: async () => response(data) } });
  assert.equal(policy.supports(viking), false, 'unknown support must not be assumed');
  await policy.load();
  assert.ok(policy.supports(viking));
  assert.ok(policy.supports(source('https://vik1ngfile.site/f/example123')));
  assert.ok(policy.supports(source('https://www.datanodes.to/example')));
  assert.ok(!policy.supports(source('https://vikingfile.com.evil.example/file')));
  assert.ok(!policy.supports(source('https://link-vault.org/file#VikingFile')));
  assert.ok(!policy.supports(source('https://unsupported.example/file')));
  assert.ok(!policy.supports(source('https://offline.example/file')));
});

test('unchecked host preferences are persisted and apply to every alias on reload', async () => {
  let saved;
  const policy = createTorBoxHosts({ http: { request: async () => response(data) }, persist: (value) => { saved = value; } });
  await policy.load();
  policy.toggle('vikingfile.com');
  assert.deepEqual(saved, ['vikingfile.com']);
  assert.ok(!policy.supports(viking));
  assert.ok(!policy.supports(source('https://vik1ngfile.site/f/example123')));
  const restored = createTorBoxHosts({ http: { request: async () => response(data) }, disabled: saved });
  await restored.load();
  assert.ok(!restored.supports(viking));
  policy.toggle('vikingfile.com');
  assert.ok(policy.supports(viking));
});

test('preference save failures preserve the old selection and surface an error', async () => {
  const policy = createTorBoxHosts({ http: { request: async () => response(data) }, persist: () => { throw new Error('Save failed'); } });
  await policy.load();
  assert.throws(() => policy.toggle('vikingfile.com'), /Save failed/);
  assert.ok(policy.supports(viking));
});

test('host requests are shared, bounded, cached and explicitly refreshable', async () => {
  let count = 0, clock = 0;
  const policy = createTorBoxHosts({ now: () => clock, http: { request: async (url, options) => {
    count++;
    assert.equal(url, 'https://api.torbox.app/v1/api/webdl/hosters');
    assert.equal(options.maxBytes, 2 * 1024 * 1024);
    assert.equal(options.headers, undefined, 'public host list must not receive account credentials');
    return response(data);
  } } });
  await Promise.all([policy.load(), policy.load()]);
  assert.equal(count, 1);
  await policy.load();
  assert.equal(count, 1);
  await policy.load(true);
  assert.equal(count, 2);
  clock = 600001;
  await policy.load();
  assert.equal(count, 3);
});

test('host fetch/schema failures disable TorBox routing and remain explicitly visible', async (context) => {
  context.mock.method(console, 'log', () => {});
  for (const result of [
    { ok: false, status: 403 },
    { ok: true, json: async () => ({ success: false }) },
    response([{ name: 'broken', status: true, domains: ['*'] }]),
    new Error('offline')
  ]) {
    const policy = createTorBoxHosts({ http: { request: () => {
      if (result instanceof Error) throw result;
      return Promise.resolve(result);
    } } });
    await policy.load();
    assert.ok(!policy.supports(viking));
    assert.ok(policy.get().error);
    assert.equal(policy.get().loading, false);
  }
});

test('unsupported, unavailable and user-disabled hosts go directly to their normal resolver', async () => {
  const policy = createTorBoxHosts({ http: { request: async () => response(data) }, disabled: ['datanodes.to'] });
  let normal = 0, viaTorBox = 0;
  const resolver = withTorBox({ resolve: async () => { normal++; return { url: 'normal' }; } }, {
    enabled: () => true, prepare: () => policy.load(), supports: policy.supports,
    resolve: async () => { viaTorBox++; return { url: 'torbox' }; }
  });
  for (const url of ['https://link-vault.org/file#VikingFile', 'https://datanodes.to/file', 'https://offline.example/file']) {
    assert.equal((await resolver.resolve(source(url))).url, 'normal');
  }
  assert.equal((await resolver.resolve(viking)).url, 'torbox');
  assert.equal(normal, 3);
  assert.equal(viaTorBox, 1);
});

test('a newly unsupported TorBox host falls back once and is bypassed until refreshed', async (context) => {
  context.mock.method(console, 'log', () => {});
  const policy = createTorBoxHosts({ http: { request: async () => response(data) } });
  let torbox = 0, normal = 0;
  const resolver = withTorBox({ resolve: async () => { normal++; throw new BrowserRequired(viking.url); } }, {
    enabled: () => true, prepare: () => policy.load(), supports: policy.supports, rejectHost: policy.reject,
    resolve: async () => { torbox++; const error = new Error('unsupported'); error.code = 'UNSUPPORTED_SITE'; throw error; }
  });
  await assert.rejects(resolver.resolve(viking), BrowserRequired);
  await assert.rejects(resolver.resolve(viking), BrowserRequired);
  assert.equal(torbox, 1);
  assert.equal(normal, 2);
  assert.ok(!policy.supports(viking));
  await policy.load(true);
  assert.ok(policy.supports(viking));
});

test('account and network failures are not disguised as host support failures', async () => {
  let normal = 0;
  const resolver = withTorBox({ resolve: async () => { normal++; } }, {
    enabled: () => true, supports: () => true,
    resolve: async () => { const error = new Error('BAD_TOKEN'); error.code = 'BAD_TOKEN'; throw error; }
  });
  await assert.rejects(resolver.resolve(viking), /BAD_TOKEN/);
  assert.equal(normal, 0);
});

test('download labels show format, actual TorBox delivery and location, not the original host', () => {
  const job = { release: { provider: 'VikingFile', format: 'exfat' }, root: '/mnt/usb0', torbox: true };
  assert.equal(downloadMeta(job), 'EXFAT · TorBox · /mnt/usb0');
  assert.equal(downloadMeta({ ...job, torbox: false }), 'EXFAT · VikingFile · /mnt/usb0');
  assert.notEqual(shapeOf(job), shapeOf({ ...job, torbox: false }));
  assert.equal(downloadMeta({ ...job, torbox: false, parts: [{ torbox: true }], partIndex: 0 }), 'EXFAT · TorBox · /mnt/usb0');
});
