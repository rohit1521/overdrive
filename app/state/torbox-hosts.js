import { t } from '../i18n/core.js';
import { webURL } from './download-sources.js';

const domainOf = (value) => typeof value === "string" && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
  ? value.toLowerCase().replace(/^www\./, "") : null;
const within = (host, domain) => host === domain || host.endsWith(`.${domain}`);

export function createTorBoxHosts({ http, disabled = [], persist = () => {}, now = Date.now }) {
  let hosts = [], loading = false, error = "", checkedAt = null, pending = null;
  let excluded = new Set(Array.isArray(disabled) ? disabled.filter((value) => domainOf(value)) : []);
  const rejected = new Set(), listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const get = () => ({ hosts, loading, error, disabled: [...excluded] });
  const hostFor = (release) => {
    let host;
    try { host = webURL(release.browserUrl || release.url).host; } catch { return null; }
    // A wrapper's label or fragment may name a supported host, but the submitted URL is still a wrapper.
    if (within(host, "link-vault.org")) return null;
    return hosts.find((item) => item.domains.some((domain) => within(host, domain))) ?? null;
  };
  async function load(force = false) {
    if (pending) return pending;
    if (!force && checkedAt !== null && now() - checkedAt < (error ? 60000 : 600000)) return;
    loading = true;
    error = "";
    emit();
    pending = Promise.resolve().then(async () => {
      try {
        const response = await http.request("https://api.torbox.app/v1/api/webdl/hosters", {
          maxBytes: 2 * 1024 * 1024, followRedirects: false
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result?.success !== true || !Array.isArray(result.data)) throw new Error("Invalid host list");
        const entries = result.data.map((item) => {
          const domains = Array.isArray(item?.domains) ? [...new Set(item.domains.map(domainOf).filter(Boolean))] : [];
          if (!domains.length || typeof item.name !== "string" || typeof item.status !== "boolean") throw new Error("Invalid host entry");
          return { id: domains[0], name: item.name, domains, available: item.status };
        });
        hosts = entries.sort((a, b) => a.name.localeCompare(b.name));
        rejected.clear();
      } catch (failure) {
        hosts = [];
        error = t("torbox.hostLoadFailed");
        console.log(`[torbox] host list unavailable: ${failure.message}`);
      } finally {
        checkedAt = now();
        loading = false;
        pending = null;
        emit();
      }
    });
    return pending;
  }
  return {
    get, load,
    supports(release) {
      const host = hostFor(release);
      return Boolean(host?.available && !excluded.has(host.id) && !rejected.has(host.id));
    },
    reject(release) {
      const host = hostFor(release);
      if (host) {
        rejected.add(host.id);
        hosts = hosts.map((item) => item.id === host.id ? { ...item, available: false } : item);
        emit();
      }
    },
    toggle(id) {
      if (!hosts.some((host) => host.id === id)) throw new Error(t("torbox.hostSaveFailed"));
      const next = new Set(excluded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist([...next]);
      excluded = next;
      emit();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
