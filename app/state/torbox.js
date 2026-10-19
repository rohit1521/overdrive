import { t } from '../i18n/core.js';
import { sourceKind, webURL } from './download-sources.js';

const API = "https://api.torbox.app/v1/api";
export function normalizeTorBoxKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9_-]{16,512}$/i.test(key)) throw new Error(t("torbox.keyRequired"));
  return key;
}
const identifier = (value) => Number.isSafeInteger(value) && value >= 0;
const abort = (signal) => {
  if (signal?.aborted) throw new Error(t("torbox.cancelled"));
};
const delay = (signal) => new Promise((resolve, reject) => {
  const cancel = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    reject(new Error(t("torbox.cancelled")));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", cancel);
    resolve();
  }, 5000);
  signal?.addEventListener("abort", cancel);
  if (signal?.aborted) cancel();
});

export function createTorBox({ http, key, wait = delay }) {
  async function request(path, apiKey, signal, options = {}) {
    abort(signal);
    let response;
    try {
      response = await http.request(`${API}/${path}`, {
        ...options,
        signal,
        maxBytes: 4 * 1024 * 1024,
        followRedirects: false,
        headers: { Authorization: `Bearer ${apiKey}`, ...options.headers }
      });
    } catch {
      abort(signal);
      throw new Error(t("torbox.failed", { reason: "NETWORK_ERROR" }));
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(t("torbox.failed", { reason: `HTTP_${response.status}` }));
    }
    abort(signal);
    if (!response.ok || result?.success !== true) {
      const reason = /^[A-Z0-9_]{1,80}$/.test(result?.error || "") ? result.error : `HTTP_${response.status}`;
      throw new Error(t("torbox.failed", { reason }));
    }
    return result.data;
  }

  return {
    enabled: () => Boolean(key()),
    async validate(value, { signal } = {}) {
      const apiKey = normalizeTorBoxKey(value);
      const user = await request("user/me?settings=false", apiKey, signal);
      if (!user || !(identifier(user.id) || typeof user.id === "string" && user.id.length > 0)) {
        throw new Error(t("torbox.failed", { reason: "INVALID_RESPONSE" }));
      }
      return apiKey;
    },
    async resolve(release, { signal } = {}) {
      const apiKey = key();
      if (!apiKey) throw new Error(t("torbox.keyRequired"));
      const link = webURL(release.browserUrl || release.url).url;
      const list = await request("webdl/mylist?limit=1000", apiKey, signal);
      if (!Array.isArray(list)) throw new Error(t("torbox.failed", { reason: "INVALID_RESPONSE" }));
      let id = list.find((item) => item.original_url === link)?.id;
      if (!identifier(id)) {
        // The native bridge accepts text bodies, so send the API's multipart form explicitly.
        const boundary = "overdrive-torbox-form";
        const body = `--${boundary}\r\nContent-Disposition: form-data; name="link"\r\n\r\n${link}\r\n--${boundary}--\r\n`;
        const created = await request("webdl/createwebdownload", apiKey, signal, {
          method: "POST",
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
          body
        });
        id = created?.webdownload_id;
        if (!identifier(id)) throw new Error(t("torbox.failed", { reason: "INVALID_RESPONSE" }));
      }
      for (let attempt = 0; attempt < 120; attempt++) {
        abort(signal);
        const item = await request(`webdl/mylist?id=${id}`, apiKey, signal);
        if (item?.id !== id) throw new Error(t("torbox.failed", { reason: "INVALID_RESPONSE" }));
        if (item.error || ["failed", "error"].includes(item.download_state)) {
          throw new Error(t("torbox.failed", { reason: "REMOTE_DOWNLOAD_FAILED" }));
        }
        if (item.download_finished && item.download_present) {
          const files = item.files;
          if (!Array.isArray(files) || !files.length) throw new Error(t("torbox.failed", { reason: "NO_FILES" }));
          const named = files.filter((file) => (file.short_name || file.name?.split("/").pop()) === release.filename);
          const file = named.length === 1 ? named[0] : files.length === 1 ? files[0] : null;
          if (!file) throw new Error(t("torbox.failed", { reason: "MULTIPLE_FILES" }));
          if (file.infected || file.zipped || !identifier(file.id) || !Number.isSafeInteger(file.size) || file.size <= 0) {
            throw new Error(t("torbox.failed", { reason: "UNUSABLE_FILE" }));
          }
          const url = await request(`webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${id}&file_id=${file.id}&redirect=false`, apiKey, signal);
          let parsed;
          try { parsed = webURL(url); } catch {
            throw new Error(t("torbox.failed", { reason: "INVALID_DOWNLOAD_URL" }));
          }
          if (!url.startsWith("https://") || !["torbox.app", "tb-cdn.pw"].some((host) => parsed.host === host || parsed.host.endsWith(`.${host}`))) {
            throw new Error(t("torbox.failed", { reason: "INVALID_DOWNLOAD_URL" }));
          }
          return { url, expectedBytes: file.size, rejectHtml: true, viaTorBox: true,
            filename: file.short_name || file.name?.split("/").pop() };
        }
        await wait(signal);
      }
      throw new Error(t("torbox.failed", { reason: "STILL_PREPARING_RESUME_LATER" }));
    }
  };
}

export function withTorBox(sources, torbox) {
  const usesTorBox = (release) => torbox.enabled() && !["direct", "manifest", "unavailable"].includes(sourceKind(release));
  return {
    usesTorBox,
    async resolve(release, options = {}) {
      if (!options.directURL && usesTorBox(release)) return torbox.resolve(release, options);
      return sources.resolve(release, options);
    }
  };
}
