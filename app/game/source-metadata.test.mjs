import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createSourceMetadata, probeSource } from '../state/source-metadata.js';
import { cancellation } from '../state/download-sources.js';

const response = (html, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status, headers, text: async () => html
});
const page = (name, size) => `<title>${name}</title><h2>${name}</h2><p>${size}</p>`;
const source = (id) => ({ id, url: `https://vikingfile.com/f/${id}`, format: 'binary' });

test('reads VikingFile filenames, formats and advertised sizes without changing a release', async () => {
  for (const [name, size, format] of [
    ['PPSA29343.exfat', '63.52 GB', 'exfat'],
    ['Beast of Reincarnation.part1.rar', '9.90 GB', 'rar'],
    ['PS5JBPINAS-PPSA30528_RedDeadRedemption.pkg', '9.07 GB', 'pkg'],
    ['backport_files.zip', '63.64 MB', 'zip'],
    ['DLCs_Pippo.rar', '30.59 kB', 'rar']
  ]) {
    const http = { request: async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.maxBytes, 1024 * 1024);
      assert.equal(options.headers, undefined, 'custom headers would disable native redirects');
      return response(page(name, size));
    } };
    const result = await probeSource(http, source('file').url);
    assert.deepEqual(result, { state: 'available', filename: name, format, sizeLabel: size });
  }
});

test('reads DataNodes generic filename elements and FileKeeper headings', async () => {
  const data = '<title>Download PPSA29343 exfat</title><div>PPSA29343.exfat</div><span>63.5 GB</span>';
  const file = '<h1>FileKeeper</h1><h2>PPSA29343.exfat</h2><div>63.5 GB</div>';
  for (const [url, html] of [['https://datanodes.to/code', data], ['https://filekeeper.net/code', file]]) {
    const result = await probeSource({ request: async () => response(html) }, url);
    assert.equal(result.format, 'exfat');
    assert.equal(result.filename, 'PPSA29343.exfat');
    assert.equal(result.sizeLabel, '63.5 GB');
  }
});

test('reads advertised archive members without confusing the archive itself with its contents', async () => {
  const html = page('game.rar', '9 GB') + '<div id="archive"><h2>Download files directly from archive</h2>' +
    '<a href="/member">PPSA00001.ffpfsc</a><span>sce_sys/param.json</span><span>eboot.bin</span></div>';
  const result = await probeSource({ request: async () => response(html) }, 'https://vikingfile.com/f/file');
  assert.equal(result.format, 'rar');
  assert.deepEqual(result.containedFormats, ['ffpfsc']);
  assert.equal(result.folderDump, true);
  const empty = await probeSource({ request: async () => response(page('game.zip', '1 GB') +
    '<div id="archive" class="hidden"><h2>Download files directly from archive</h2></div>') }, 'https://vikingfile.com/f/file');
  assert.equal(empty.format, 'zip');
  assert.equal(empty.containedFormats, undefined);
  assert.equal(empty.folderDump, undefined);
});

test('decodes filename entities and ignores script contents', async () => {
  const html = '<script>game.zip 900 GB</script><h2>Beast &amp; Wolf&#46;rar</h2><p>2.5 GB</p>';
  const result = await probeSource({ request: async () => response(html) }, source('file').url);
  assert.equal(result.filename, 'Beast & Wolf.rar');
  assert.equal(result.sizeLabel, '2.5 GB');
});

test('only reports missing for 404/410 or an explicit successful missing-file page', async () => {
  for (const status of [200, 404, 410]) {
    assert.equal((await probeSource({ request: async () => response('<h2>File not found</h2>', status) }, source('file').url)).state, 'missing');
  }
  for (const status of [401, 403, 429, 500, 503]) {
    assert.equal((await probeSource({ request: async () => response('<h2>File not found</h2>', status) }, source('file').url)).state, 'unverified');
  }
  assert.equal((await probeSource({ request: async () => response('<title>Just a moment</title>cf-chl-', 404) }, source('file').url)).state, 'unverified');
  assert.equal((await probeSource({ request: async () => response('<title>Login</title>') }, source('file').url)).state, 'unverified');
});

test('HEAD probes direct files, never treats HTML length as file size', async () => {
  const url = 'https://archive.org/download/item/game.ffpfsc';
  const request = async (url, options) => {
    assert.equal(options.method, 'HEAD');
    return response('', 200, { 'content-length': '123456', 'content-type': 'application/octet-stream' });
  };
  assert.deepEqual(await probeSource({ request }, url), { state: 'available', format: 'ffpfsc', sizeBytes: 123456 });
  assert.equal((await probeSource({ request: async () => response('', 403) }, url)).state, 'unverified');
  assert.equal((await probeSource({ request: async () => response('', 200, { 'content-type': 'text/html', 'content-length': '1000' }) }, url)).state, 'unverified');
  assert.equal((await probeSource({ request: async () => response('', 404) }, url)).state, 'missing');
});

test('unsupported host pages remain unverified without fetching', async () => {
  assert.deepEqual(await probeSource({ request() { assert.fail('must not fetch unsupported pages'); } }, 'https://example.com/opaque'), { state: 'unverified' });
});

test('deduplicates URLs, caps concurrency at three, and does not mutate releases', async () => {
  let active = 0, peak = 0, calls = 0;
  const http = { async request() {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise(setImmediate);
    active--;
    return response(page('game.exfat', '9.7 GB'));
  } };
  const store = createSourceMetadata({ http });
  const releases = Array.from({ length: 8 }, (_, id) => source(String(id)));
  const before = JSON.stringify(releases);
  let notifications = 0;
  const off = store.subscribe(() => notifications++);
  const first = store.check(releases);
  assert.equal(store.get(releases[0]).state, 'checking');
  await Promise.all([first, store.check(releases)]);
  assert.equal(calls, 8);
  assert.equal(peak, 3);
  assert.equal(JSON.stringify(releases), before);
  assert.equal(store.get(releases[0]).format, 'exfat');
  assert.ok(notifications > 0);
  off();
  const count = notifications;
  await store.check(releases);
  assert.equal(notifications, count);
});

test('caches successes for ten minutes and supports an explicit refresh', async () => {
  let clock = 0, calls = 0;
  const store = createSourceMetadata({ now: () => clock, http: { async request() {
    calls++;
    return response(page('game.pkg', '9.07 GB'));
  } } });
  const releases = [source('file')];
  await store.check(releases);
  await store.check(releases);
  assert.equal(calls, 1);
  clock = 600001;
  await store.check(releases);
  assert.equal(calls, 2);
  await store.check(releases, true);
  assert.equal(calls, 3);
  assert.equal(store.get(releases[0]).checkedAt, clock);
});

test('errors are logged, stay unverified, retry after a minute, and do not stop the queue', async () => {
  let clock = 0, calls = 0;
  const logs = [];
  const store = createSourceMetadata({ now: () => clock, log: (message) => logs.push(message), http: { async request(url) {
    calls++;
    if (url.endsWith('/bad')) throw new Error('TLS failed');
    return response(page('game.rar', '1 GB'));
  } } });
  const releases = [source('bad'), source('good'), { id: 'invalid', url: 'invalid' }];
  await store.check(releases);
  assert.equal(store.get(releases[0]).state, 'unverified');
  assert.equal(store.get(releases[1]).state, 'available');
  assert.equal(store.get(releases[2]).state, 'unverified');
  assert.equal(logs.length, 2);
  assert.ok(logs.some((message) => message.includes('TLS failed')));
  assert.ok(logs.some((message) => message.includes('Invalid HTTP URL')));
  await store.check([releases[0]]);
  assert.equal(calls, 2);
  clock = 60001;
  await store.check([releases[0]]);
  assert.equal(calls, 3);
});

test('aggregates multipart format, approximate size and missing-volume status', async () => {
  let missing = false;
  const store = createSourceMetadata({ http: { async request(url) {
    if (missing && url.endsWith('/2')) return response('File not found', 404);
    return response(page(`game.part${url.slice(-1)}.rar`, url.endsWith('/3') ? '8.15 GB' : '9.90 GB'));
  } } });
  const release = { parts: [1, 2, 3].map((id) => ({ sources: [source(String(id))] })) };
  await store.check([release]);
  assert.deepEqual(store.get(release), { state: 'available', format: 'rar', sizeLabel: '~ 27.95 GB' });
  missing = true;
  await store.check([release], true);
  assert.equal(store.get(release).state, 'missing');
  assert.equal(store.get(release).format, null);
});

test('metadata labels exist in every locale', () => {
  const directory = new URL('../i18n/locales/', import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    const messages = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const state of ['checking', 'available', 'missing', 'unverified', 'refresh']) {
      assert.ok(messages[`sources.check.${state}`], `${file}: ${state}`);
    }
  }
});

function controlledMetadata() {
  const requests = [];
  const log = [];
  const http = { request(url, { signal }) {
    return new Promise((resolve, reject) => {
      const request = { url, signal, resolve: () => resolve(response(page('game.exfat', '1 GB'))) };
      requests.push(request);
      signal.addEventListener('abort', () => reject(new Error('Cancelled')));
    });
  } };
  return { requests, log, store: createSourceMetadata({ http, log: (message) => log.push(message) }) };
}

test('cancelled watchers release all network slots for the newly opened game', async () => {
  const { store, requests, log } = controlledMetadata();
  const old = [source('old1'), source('old2'), source('old3'), source('old4')];
  const off = store.watch(old, () => {});
  assert.equal(requests.length, 3);
  off();
  const next = [source('new')];
  const stop = store.watch(next, () => {});
  await new Promise(setImmediate);
  assert.equal(requests.length, 4);
  assert.ok(requests.slice(0, 3).every((request) => request.signal.aborted));
  assert.ok(requests[3].url.endsWith('/new'));
  requests[3].resolve();
  await store.check(next);
  assert.equal(store.get(old[0]), null);
  assert.equal(store.get(next[0]).state, 'available');
  assert.equal(log.length, 0, 'navigation cancellation is not a network failure');
  stop();
});

test('shared requests survive until their last interested screen closes', async () => {
  const { store, requests } = controlledMetadata();
  const selected = [source('shared')];
  const first = store.watch(selected, () => {});
  const second = store.watch(selected, () => {});
  assert.equal(requests.length, 1);
  first();
  assert.equal(requests[0].signal.aborted, false);
  second();
  assert.equal(requests[0].signal.aborted, true);
  await new Promise(setImmediate);
  assert.equal(store.get(selected[0]), null);
});

test('a selected source moves ahead of other queued checks without exceeding the cap', async () => {
  const { store, requests } = controlledMetadata();
  const releases = Array.from({ length: 8 }, (_, index) => source(String(index)));
  const off = store.watch(releases, () => {});
  store.prioritize(releases[7]);
  requests[0].resolve();
  await new Promise(setImmediate);
  assert.equal(requests.length, 4);
  assert.equal(requests[3].url, releases[7].url);
  off();
  await new Promise(setImmediate);
});

test('notifications are scoped to relevant sources and cached-only checks emit nothing', async () => {
  const store = createSourceMetadata({ http: { request: async () => response(page('game.rar', '1 GB')) } });
  const first = [source('one')], second = [source('two')];
  await store.check(first);
  let updates = 0;
  const off = store.watch(first, () => updates++);
  await store.check(first);
  assert.equal(updates, 0);
  await store.check(second);
  assert.equal(updates, 0);
  await store.check(first, true);
  assert.equal(updates, 2, 'only checking and completion change the relevant source');
  off();
});

test('probes pass cancellation through to native HTTP', async () => {
  const cancel = cancellation();
  await probeSource({ request: async (url, options) => {
    assert.equal(options.signal, cancel.signal);
    return response(page('game.zip', '1 GB'));
  } }, source('file').url, cancel.signal);
});
