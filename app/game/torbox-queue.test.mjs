import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { configure } from '../i18n/core.js';
import { DownloadFormats } from '../../ps5-react/runtime/js/download-formats.js';
import { withTorBox } from '../state/torbox.js';
import { BrowserRequired } from '../state/download-sources.js';

// Replace only platform services; exercise the application's actual queue and persistence code.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === '@ps5-react/core') return { shortCircuit: true,
      url: 'data:text/javascript,' + encodeURIComponent('export const FileSystem = { dataDir: "/test", exists: () => false };') };
    if (specifier === 'react') return { shortCircuit: true,
      url: 'data:text/javascript,' + encodeURIComponent('export const useEffect = () => {}; export const useState = () => {};') };
    return next(specifier, context);
  }
`)}`, import.meta.url);
const { createDownloadQueue } = await import('../state/download-queue.js');
configure(() => JSON.parse(readFileSync(new URL('../i18n/locales/en.json', import.meta.url), 'utf8')));

function fixture() {
  const files = new Map();
  const transfers = [];
  let enabled = true, resolved = 0, fail = true;
  const fs = {
    exists: (path) => files.has(path),
    readFile: (path) => files.get(path),
    writeFile: (path, data) => files.set(path, data),
    rename: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    mkdir() {},
    stat: (path) => path === '/data' ? { isDirectory: true, device: '1', inode: '2' } : files.has(path) ? { isFile: true, size: 10 } : null,
    diskUsage: () => ({ free: 1e12 }),
    remove: (path) => files.delete(path)
  };
  const sources = withTorBox({ resolve: async () => { throw new BrowserRequired('https://vikingfile.com/f/example123'); } }, {
    enabled: () => enabled,
    resolve: async (release, { onProgress }) => {
      onProgress?.({ progress: 0.42, eta: 90 });
      return { viaTorBox: true, url: `https://test.tb-cdn.pw/file?token=secret-${++resolved}`,
        expectedBytes: 10, filename: 'game.exfat', rejectHtml: true };
    }
  });
  const queue = createDownloadQueue({
    fs, sources, formats: DownloadFormats, dataDir: '/test', platform: 'desktop',
    power: { keepAwake() {} }, notifications: { show() {} },
    downloads: { enqueue(options) {
      transfers.push(options);
      return { subscribe: () => () => {}, done: Promise.resolve().then(() => {
        if (fail) throw new Error('HTTP 403 browser verification required');
        files.set(options.destination, '0123456789');
      }) };
    } }
  });
  const release = { id: 'source', filename: 'game.binary', format: 'binary',
    provider: 'VikingFile', url: 'https://vikingfile.com/f/example123' };
  const enqueue = (selected = release) => queue.enqueue({ id: 'PPSA00001', title: 'Test' }, selected, '/data');
  return { queue, files, transfers, release, enqueue, setEnabled: (value) => { enabled = value; },
    succeed: () => { fail = false; }, resolutions: () => resolved };
}
async function settled(queue) {
  for (let tick = 0; tick < 100; tick++) {
    await new Promise(setImmediate);
    if (queue.snapshot().every((job) => ['failed', 'paused', 'file-downloaded', 'awaiting-browser'].includes(job.state))) return;
  }
  assert.fail('Queue did not settle');
}

test('single downloads persist no signed URLs, fail without browser fallback and regenerate on resume', async () => {
  const f = fixture();
  const id = f.enqueue();
  await settled(f.queue);
  assert.equal(f.queue.snapshot()[0].state, 'failed');
  assert.equal(f.queue.snapshot()[0].torbox, true);
  let saved = f.files.get('/test/overdrive/downloads.json');
  assert.ok(!saved.includes('secret-1'));
  assert.equal(JSON.parse(saved).jobs[0].options, undefined);
  f.succeed();
  f.queue.resume(id);
  await settled(f.queue);
  assert.equal(f.resolutions(), 2);
  assert.ok(f.transfers[1].url.endsWith('secret-2'));
  assert.equal(f.transfers[1].expectedBytes, 10);
  assert.equal(f.queue.snapshot()[0].fileName, 'game.exfat');
  assert.equal(f.queue.snapshot()[0].state, 'file-downloaded');
  saved = f.files.get('/test/overdrive/downloads.json');
  assert.ok(!saved.includes('secret-'));
});

test('resuming a TorBox transfer without a session key fails instead of opening a host page', async () => {
  const f = fixture();
  const id = f.enqueue();
  await settled(f.queue);
  f.setEnabled(false);
  f.queue.resume(id);
  await settled(f.queue);
  assert.equal(f.resolutions(), 1);
  assert.equal(f.transfers.length, 1);
  assert.match(f.queue.snapshot()[0].error, /TorBox API key/);
});

test('multipart downloads use TorBox per volume without persisting CDN options', async () => {
  const f = fixture();
  const release = { ...f.release, id: 'set', format: 'archive-set', filename: 'set-game',
    parts: [{ number: 1, sources: [f.release] }] };
  const id = f.enqueue(release);
  await settled(f.queue);
  assert.equal(f.queue.snapshot()[0].state, 'failed');
  assert.equal(f.queue.snapshot()[0].parts[0].torbox, true);
  const saved = JSON.parse(f.files.get('/test/overdrive/downloads.json'));
  assert.equal(saved.jobs[0].parts[0].options, undefined);
  assert.ok(!JSON.stringify(saved).includes('secret-'));
  f.queue.resume(id);
  await settled(f.queue);
  assert.equal(f.resolutions(), 2);
  assert.equal(f.transfers.length, 2);
});

test('an existing browser-waiting job can continue through TorBox without opening the browser', async () => {
  const f = fixture();
  f.setEnabled(false);
  const id = f.enqueue();
  await settled(f.queue);
  assert.equal(f.queue.snapshot()[0].state, 'awaiting-browser');
  f.setEnabled(true);
  f.queue.openBrowser(id);
  await settled(f.queue);
  assert.equal(f.queue.snapshot()[0].state, 'failed');
  assert.equal(f.resolutions(), 1);
  assert.equal(f.transfers.length, 1);
});

test('TorBox preparation progress is emitted for single and multipart jobs', async () => {
  for (const multipart of [false, true]) {
    const f = fixture();
    const messages = [];
    const off = f.queue.subscribe((jobs) => messages.push(...jobs.map((job) => job.message || '')));
    f.enqueue(multipart ? { ...f.release, id: 'set', format: 'archive-set', filename: 'set-game',
      parts: [{ number: 1, sources: [f.release] }] } : f.release);
    await settled(f.queue);
    assert.ok(messages.some((message) => message.includes('TorBox preparing: 42%')));
    if (multipart) assert.ok(messages.some((message) => /1.*1.*TorBox preparing/.test(message)));
    off();
  }
});

test('queue snapshots do not share mutable artifact display metadata', async () => {
  const f = fixture();
  f.enqueue();
  await settled(f.queue);
  const [snapshot] = f.queue.snapshot();
  snapshot.artifact.format = 'zip';
  assert.equal(f.queue.snapshot()[0].artifact.format, 'binary');
});
