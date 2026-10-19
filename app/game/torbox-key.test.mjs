import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { configure } from '../i18n/core.js';
import { cancellation } from '../state/download-sources.js';
import { createTorBoxKeyStore } from '../state/torbox-key.js';

configure(() => JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8')));
const oldKey = 'dummy-existing-api-key';
const newKey = 'dummy-replacement-api-key';
const directory = '/test/overdrive';
const file = `${directory}/torbox.json`;
function fixture(saved = oldKey) {
  const files = new Map(saved ? [[file, JSON.stringify({ apiKey: saved })]] : []);
  const calls = [];
  const fs = {
    exists: (path) => files.has(path),
    readFile: (path) => files.get(path),
    mkdir: (...args) => calls.push(['mkdir', ...args]),
    writeFile: (path, data, options) => { calls.push(['writeFile', path, options]); files.set(path, data); },
    chmod: (path, mode) => calls.push(['chmod', path, mode]),
    rename: (from, to) => { calls.push(['rename', from, to]); files.set(to, files.get(from)); files.delete(from); },
    remove: (path) => files.delete(path)
  };
  const validate = async (value) => value;
  const store = createTorBoxKeyStore({ fs, directory, validate });
  return { store, fs, files, calls, validate };
}

test('restores the saved key at launch without a network request', () => {
  const f = fixture();
  assert.equal(f.store.get(), oldKey);
  assert.equal(f.store.error(), '');
  assert.equal(f.calls.length, 0);
});

test('saves a validated key atomically, with sync and private file permissions, and restores it', async () => {
  const f = fixture();
  let observed;
  f.store.subscribe((enabled) => { observed = enabled; });
  await f.store.save(` ${newKey} `);
  assert.equal(f.store.get(), newKey);
  assert.equal(observed, true);
  assert.deepEqual(f.calls.slice(1), [
    ['writeFile', `${file}.tmp`, { sync: true }],
    ['chmod', `${file}.tmp`, 384],
    ['rename', `${file}.tmp`, file]
  ]);
  assert.equal(f.files.has(`${file}.tmp`), false);
  const reopened = createTorBoxKeyStore({ fs: f.fs, directory, validate: f.validate });
  assert.equal(reopened.get(), newKey);
});

test('invalid input and authentication failure never overwrite the saved key', async () => {
  const f = fixture();
  const store = createTorBoxKeyStore({ fs: f.fs, directory,
    validate: async () => { throw new Error('TorBox: BAD_TOKEN'); } });
  await assert.rejects(store.save(newKey), /BAD_TOKEN/);
  await assert.rejects(store.save(''), /API key/);
  assert.equal(store.get(), oldKey);
  assert.equal(f.files.get(file), JSON.stringify({ apiKey: oldKey }));
  assert.equal(f.calls.length, 0);
});

test('no key is written until validation completes, and cancellation prevents a late save', async () => {
  const f = fixture();
  const cancel = cancellation();
  let finish;
  const store = createTorBoxKeyStore({ fs: f.fs, directory, validate: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = store.save(newKey, { signal: cancel.signal });
  assert.equal(f.calls.length, 0);
  assert.equal(store.get(), oldKey);
  cancel.cancel();
  finish(newKey);
  await assert.rejects(pending, /cancelled/);
  assert.equal(f.calls.length, 0);
  assert.equal(store.get(), oldKey);
});

test('write, permissions and rename failures preserve the previous key and report an error', async () => {
  for (const method of ['writeFile', 'chmod', 'rename']) {
    const f = fixture();
    f.fs[method] = () => { throw new Error('disk failure'); };
    await assert.rejects(f.store.save(newKey), /Could not save/);
    assert.equal(f.store.get(), oldKey);
    assert.equal(f.files.get(file), JSON.stringify({ apiKey: oldKey }));
    assert.equal(f.files.has(`${file}.tmp`), false);
  }
});

test('removing the key disables TorBox across subsequent launches', async () => {
  const f = fixture();
  let observed;
  const off = f.store.subscribe((enabled) => { observed = enabled; });
  f.store.clear();
  assert.equal(f.store.get(), '');
  assert.equal(observed, false);
  assert.equal(f.files.has(file), false);
  const reopened = createTorBoxKeyStore({ fs: f.fs, directory, validate: f.validate });
  assert.equal(reopened.get(), '');
  off();
  await f.store.save(newKey);
  assert.equal(observed, false);
});

test('a deletion failure leaves TorBox enabled and reports failure', () => {
  const f = fixture();
  f.fs.remove = () => { throw new Error('permission denied'); };
  assert.throws(() => f.store.clear(), /Could not save or remove/);
  assert.equal(f.store.get(), oldKey);
  assert.equal(f.files.has(file), true);
});

test('corrupt saved data is surfaced without logging credentials and can be replaced', async (context) => {
  const f = fixture();
  f.files.set(file, '{broken-secret');
  const log = context.mock.method(console, 'log', () => {});
  const store = createTorBoxKeyStore({ fs: f.fs, directory, validate: f.validate });
  assert.equal(store.get(), '');
  assert.match(store.error(), /Could not read/);
  assert.equal(log.mock.calls.length, 1);
  assert.ok(!JSON.stringify(log.mock.calls).includes('broken-secret'));
  await store.save(newKey);
  assert.equal(store.get(), newKey);
  assert.equal(store.error(), '');
});
