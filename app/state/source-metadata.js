import { filenameFormat, linkFormat } from '../game/source-format.js';
import { webURL } from './download-sources.js';

const PAGE_HOST = /^(?:(?:www\.)?vikingfile\.com|vik1ngfile\.site|(?:www\.)?datanodes\.to|(?:www\.)?filekeeper\.net)$/i;
const sourcesOf = (release) => release.parts?.flatMap((part) => part.sources) ?? [release];
const urlOf = (source) => source.browserUrl || source.url;
const plain = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, (entity) => {
    if (entity[1] === "#") {
      const value = entity.slice(2, -1);
      const code = /^x/i.test(value) ? parseInt(value.slice(1), 16) : Number(value);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " }[entity.toLowerCase()];
  }).replace(/\s+/g, " ").trim();

export async function probeSource(http, url) {
  const { host } = webURL(url);
  const page = PAGE_HOST.test(host);
  if (!page && !linkFormat(url)) return { state: "unverified" };
  const response = await http.request(url, { method: page ? "GET" : "HEAD", maxBytes: 1024 * 1024 });
  if (!page) {
    if ([404, 410].includes(response.status)) return { state: "missing" };
    if (!response.ok || /html/i.test(response.headers["content-type"] || "")) return { state: "unverified" };
    const bytes = Number(response.headers["content-length"]);
    return { state: "available", format: linkFormat(url), sizeBytes: Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null };
  }
  const html = await response.text();
  const text = plain(html);
  const headings = [...html.matchAll(/<(?:title|h[12])\b[^>]*>([\s\S]*?)<\/(?:title|h[12])>/gi)]
    .map((match) => plain(match[1]).replace(/^Download\s+/i, ""));
  const filename = headings.find((name) => filenameFormat(name)) ??
    text.split(" ").find((word) => filenameFormat(word));
  if (!response.ok || !filename) {
    const challenge = /just a moment|checking your browser|verify you are human|cf-chl-/i.test(html);
    const missing = [404, 410].includes(response.status) || response.ok && /\bfile (?:not found|has been removed|was deleted)\b/i.test(text);
    return { state: !challenge && missing ? "missing" : "unverified" };
  }
  const afterName = text.slice(text.indexOf(filename) + filename.length, text.indexOf(filename) + filename.length + 1000);
  const sizeLabel = /\b\d+(?:[.,]\d+)?\s*(?:GiB|MiB|KiB|GB|MB|KB|B)\b/i.exec(afterName)?.[0] ?? null;
  return { state: "available", filename, format: filenameFormat(filename), sizeLabel };
}

export function createSourceMetadata({ http, now = Date.now, log = console.log }) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  const listeners = new Set();
  let active = 0;
  const emit = () => { for (const listener of listeners) listener(); };
  const pump = () => {
    while (active < 3 && queue.length) {
      const { url, resolve } = queue.shift();
      active++;
      void probeSource(http, url).catch((error) => {
        log(`[source-metadata] check failed: ${error.message}`);
        return { state: "unverified" };
      }).then((result) => {
        cache.delete(url);
        cache.set(url, { ...result, checkedAt: now() });
        while (cache.size > 256) cache.delete(cache.keys().next().value);
        pending.delete(url);
        active--;
        resolve();
        emit();
        pump();
      });
    }
  };
  const check = (releases, force = false) => {
    const urls = [...new Set(releases.flatMap(sourcesOf).map(urlOf).filter(Boolean))];
    const tasks = urls.map((url) => {
      if (pending.has(url)) return pending.get(url);
      const saved = cache.get(url);
      if (!force && saved && now() - saved.checkedAt < (saved.state === "available" ? 600000 : 60000)) return Promise.resolve();
      const task = new Promise((resolve) => queue.push({ url, resolve }));
      pending.set(url, task);
      return task;
    });
    pump();
    emit();
    return Promise.all(tasks);
  };
  const get = (release) => {
    const urls = [...new Set(sourcesOf(release).map(urlOf).filter(Boolean))];
    if (!urls.length) return null;
    const values = urls.map((url) => pending.has(url) ? { ...cache.get(url), state: "checking" } : cache.get(url));
    if (values.every((value) => !value)) return null;
    if (values.length === 1) return values[0];
    const state = values.some((value) => value?.state === "missing") ? "missing" :
      values.some((value) => value?.state === "checking") ? "checking" :
      values.every((value) => value?.state === "available") ? "available" : "unverified";
    const format = values.every((value) => value?.format && value.format === values[0]?.format) ? values[0].format : null;
    const sizes = values.map((value) => /^(\d+(?:\.\d+)?)\s*(GB|MB|KB)$/i.exec(value?.sizeLabel || ""));
    const sizeLabel = sizes.every((size) => size && size[2].toUpperCase() === sizes[0]?.[2].toUpperCase())
      ? `~ ${Number(sizes.reduce((sum, size) => sum + Number(size[1]), 0).toFixed(2))} ${sizes[0][2]}` : null;
    return { state, format, sizeLabel };
  };
  return { check, get, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
