import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { configure } from '../i18n/core.js';
import { cancellation } from '../state/download-sources.js';
import { createTorBox, withTorBox } from '../state/torbox.js';

const messages = JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8'));
configure(() => messages, messages);
const key = 'dummy-api-key-for-tests-only';
const release = { filename: 'PPSA29343.exfat', url: 'https://vikingfile.com/f/example123', format: 'binary' };
const cdn = 'https://node.tb-cdn.pw/dld/example?token=dummy-signed-token';
const ready = { id: 7, download_finished: true, download_present: true,
  files: [{ id: 0, name: 'PPSA29343.exfat', size: 123456, infected: false, zipped: false }] };
const success = (data) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

function client(responses, options = {}) {
  const requests = [];
  const torbox = createTorBox({ key: () => key, wait: async () => {}, ...options, http: {
    async request(url, args) {
      requests.push({ url, args });
      assert.equal(args.followRedirects, false);
      assert.equal(args.headers.Authorization, `Bearer ${key}`);
      assert.equal(args.maxBytes, 4 * 1024 * 1024);
      const next = responses.shift();
      assert.ok(next, 'unexpected API request');
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(url, args) : next;
    }
  } });
  return { torbox, requests };
}

test('creates a web download, polls completion and returns the exact file size and fresh CDN link', async () => {
  const { torbox, requests } = client([
    success([]), success({ webdownload_id: 7 }), success({ id: 7 }), success(ready), success(cdn)
  ]);
  assert.deepEqual(await torbox.resolve(release), {
    url: cdn, expectedBytes: 123456, filename: release.filename, viaTorBox: true, rejectHtml: true
  });

  assert.ok(requests[0].url.endsWith('/webdl/mylist?limit=1000'));
  assert.ok(requests[1].url.endsWith('/webdl/createwebdownload'));
  assert.equal(requests[1].args.method, 'POST');
  assert.match(requests[1].args.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.ok(requests[1].args.body.includes(`\r\n\r\n${release.url}\r\n`));
  assert.ok(requests[4].url.includes('web_id=7&file_id=0&redirect=false'));
});

test('validates a trimmed API key using only the authenticated read-only user endpoint', async () => {
  const { torbox, requests } = client([success({ id: 0 })]);
  assert.equal(await torbox.validate(` ${key} `), key);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.torbox.app/v1/api/user/me?settings=false');
  assert.equal(requests[0].args.method, undefined);
  assert.ok(!requests[0].url.includes(key));
});

test('key validation rejects bad syntax, authentication failures and malformed success responses', async () => {
  const invalid = client([]);
  for (const value of ['', 'https://example.com/?token=secret', null]) {
    await assert.rejects(invalid.torbox.validate(value), /API key/);
  }
  assert.equal(invalid.requests.length, 0);
  const denied = client([{ ok: false, status: 403, json: async () => ({ success: false, error: 'BAD_TOKEN' }) }]);
  await assert.rejects(denied.torbox.validate(key), /BAD_TOKEN/);
  for (const value of [null, {}, [], { id: -1 }]) {
    await assert.rejects(client([success(value)]).torbox.validate(key), /INVALID_RESPONSE/);
  }
});

test('reuses an existing exact-URL download without creating another account item', async () => {
  const { torbox, requests } = client([
    success([{ id: 7, original_url: release.url }]), success(ready), success(cdn)
  ]);
  await torbox.resolve(release);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ args }) => args.method !== 'POST'));
});

test('reports bounded TorBox preparation progress and ETA without exposing account data', async () => {
  const { torbox } = client([
    success([{ id: 7, original_url: release.url }]),
    success({ id: 7, progress: 0.42, eta: 90, name: 'not for UI', auth_id: 'private' }),
    success({ ...ready, progress: 1, eta: 0 }), success(cdn)
  ]);
  const progress = [];
  await torbox.resolve(release, { onProgress: (value) => progress.push(value) });
  assert.deepEqual(progress, [{ progress: 0.42, eta: 90 }, { progress: 1, eta: null }]);
});

test('returns explicit account and host errors without leaking returned details', async () => {
  for (const reason of ['BAD_TOKEN', 'PLAN_RESTRICTED_FEATURE', 'UNSUPPORTED_SITE', 'ACTIVE_LIMIT', 'LINK_OFFLINE']) {
    const { torbox } = client([{ ok: false, status: 400, json: async () =>
      ({ success: false, error: reason, detail: `${key} ${cdn}` }) }]);
    await assert.rejects(torbox.resolve(release), (error) => {
      assert.ok(error.message.includes(reason));
      assert.ok(!error.message.includes(key) && !error.message.includes(cdn));
      return true;
    });
  }
  const { torbox } = client([{ ok: true, status: 200, json: async () => ({ success: false, error: cdn }) }]);
  await assert.rejects(torbox.resolve(release), /HTTP_200/);
});

test('sanitizes transport and non-JSON failures', async () => {
  for (const result of [new Error(`Http.request ${key}`),
    { ok: false, status: 502, json: async () => { throw new Error(cdn); } }]) {
    const { torbox } = client([result]);
    await assert.rejects(torbox.resolve(release), (error) => {
      assert.ok(!error.message.includes(key) && !error.message.includes(cdn));
      return true;
    });
  }
});

test('cancels before network activity or between polls', async () => {
  const cancel = cancellation();
  cancel.cancel();
  const first = client([], {});
  await assert.rejects(first.torbox.resolve(release, { signal: cancel.signal }), /cancelled/);
  assert.equal(first.requests.length, 0);
  const next = cancellation();
  const { torbox } = client([success([{ id: 7, original_url: release.url }]), success({ id: 7 })],
    { wait: async () => next.cancel() });
  await assert.rejects(torbox.resolve(release, { signal: next.signal }), /cancelled/);
});

test('cancellation interrupts the actual poll timer immediately', async () => {
  const cancel = cancellation();
  const { torbox } = client([success([{ id: 7, original_url: release.url }]), success({ id: 7 })],
    { wait: undefined });
  const promise = torbox.resolve(release, { signal: cancel.signal });
  await new Promise(setImmediate);
  cancel.cancel();
  await assert.rejects(promise, /cancelled/);
});

test('limits polling and leaves remote downloads intact for later resume', async () => {
  const { torbox, requests } = client([
    success([{ id: 7, original_url: release.url }]), ...Array.from({ length: 120 }, () => success({ id: 7 }))
  ]);
  await assert.rejects(torbox.resolve(release), /STILL_PREPARING_RESUME_LATER/);
  assert.equal(requests.length, 121);
  assert.ok(requests.every(({ args }) => args.method !== 'POST'));
});

test('refuses remote failures, unsafe files and ambiguous multi-file downloads', async () => {
  for (const [item, reason] of [
    [{ id: 7, error: 'failure' }, 'REMOTE_DOWNLOAD_FAILED'],
    [{ ...ready, files: [] }, 'NO_FILES'],
    [{ ...ready, files: [{ id: 0, name: 'other.rar', size: 10 }, { id: 1, name: 'another.pkg', size: 20 }] }, 'MULTIPLE_FILES'],
    [{ ...ready, files: [{ ...ready.files[0], infected: true }] }, 'UNUSABLE_FILE'],
    [{ ...ready, files: [{ ...ready.files[0], zipped: true }] }, 'UNUSABLE_FILE'],
    [{ ...ready, files: [{ ...ready.files[0], size: 0 }] }, 'UNUSABLE_FILE'],
    [{ ...ready, id: 8 }, 'INVALID_RESPONSE']
  ]) {
    const { torbox } = client([success([{ id: 7, original_url: release.url }]), success(item)]);
    await assert.rejects(torbox.resolve(release), new RegExp(reason));
  }
});

test('selects only an exact filename match from a multi-file result', async () => {
  const { torbox } = client([
    success([{ id: 7, original_url: release.url }]),
    success({ ...ready, files: [...ready.files, { id: 2, name: 'readme.txt', size: 5 }] }), success(cdn)
  ]);
  assert.equal((await torbox.resolve(release)).filename, release.filename);
});

test('refuses non-HTTPS URLs and domains outside the TorBox CDN', async () => {
  for (const url of ['http://node.tb-cdn.pw/file', 'https://tb-cdn.pw.attacker.example/file', 'https://example.com/file', 'invalid']) {
    const { torbox } = client([
      success([{ id: 7, original_url: release.url }]), success(ready), success(url)
    ]);
    await assert.rejects(torbox.resolve(release), /INVALID_DOWNLOAD_URL/);
  }
});

test('requires a key and validates API response shapes before proceeding', async () => {
  const withoutKey = client([], { key: () => '' });
  assert.equal(withoutKey.torbox.enabled(), false);
  await assert.rejects(withoutKey.torbox.resolve(release), /API key/);
  for (const responses of [[success({})], [success([]), success({ webdownload_id: '7' })]]) {
    await assert.rejects(client(responses).torbox.resolve(release), /INVALID_RESPONSE/);
  }
});

test('routing is opt-in, preserves direct URLs, and never silently falls back on TorBox errors', async () => {
  let enabled = false, normalCalls = 0, torboxCalls = 0;
  const normal = { resolve: async () => { normalCalls++; return { normal: true }; } };
  const torbox = { enabled: () => enabled, resolve: async () => { torboxCalls++; throw new Error('TorBox: UNSUPPORTED_SITE'); } };
  const sources = withTorBox(normal, torbox);
  await sources.resolve(release);
  enabled = true;
  await assert.rejects(sources.resolve(release), /UNSUPPORTED_SITE/);
  await sources.resolve(release, { directURL: 'https://example.com/file.exfat' });
  await sources.resolve({ url: 'https://example.com/file.exfat' });
  assert.equal(normalCalls, 3);
  assert.equal(torboxCalls, 1);
});

test('every locale defines all TorBox UI and error strings', () => {
  const directory = new URL('../i18n/locales/', import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    const locale = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const name of ['title', 'detail', 'enabled', 'keyRequired', 'cancelled', 'failed',
      'save', 'checking', 'remove', 'saveFailed', 'loadFailed']) {
      assert.ok(locale[`torbox.${name}`], `${file}: ${name}`);
    }
    assert.ok(locale['torbox.failed'].includes('{reason}'), file);
  }
});
