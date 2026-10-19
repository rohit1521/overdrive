import { t } from '../i18n/core.js';
import { normalizeTorBoxKey } from './torbox.js';

export function createTorBoxKeyStore({ fs, directory, validate }) {
  const file = `${directory}/torbox.json`;
  let apiKey = "", error = "";
  const listeners = new Set();
  try {
    if (fs.exists(file)) apiKey = normalizeTorBoxKey(JSON.parse(fs.readFile(file)).apiKey);
  } catch {
    error = t("torbox.loadFailed");
    console.log("[torbox] saved key could not be loaded");
  }
  const update = (next) => {
    apiKey = next;
    error = "";
    for (const listener of listeners) listener(Boolean(next));
  };
  return {
    get: () => apiKey,
    error: () => error,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async save(value, options = {}) {
      const next = await validate(normalizeTorBoxKey(value), options);
      if (options.signal?.aborted) throw new Error(t("torbox.cancelled"));
      try {
        fs.mkdir(directory, { recursive: true });
        fs.writeFile(`${file}.tmp`, JSON.stringify({ apiKey: next }), { sync: true });
        fs.chmod(`${file}.tmp`, 384);
        fs.rename(`${file}.tmp`, file);
      } catch {
        try {
          if (fs.exists(`${file}.tmp`)) fs.remove(`${file}.tmp`);
        } catch {
          console.log("[torbox] temporary key file could not be removed");
        }
        throw new Error(t("torbox.saveFailed"));
      }
      update(next);
    },
    clear() {
      try {
        for (const path of [`${file}.tmp`, file]) if (fs.exists(path)) fs.remove(path);
      } catch {
        throw new Error(t("torbox.saveFailed"));
      }
      update("");
    }
  };
}
