import { t } from '../i18n/core.js';

const EXTENSION = /\.(tar\.(?:gz|bz2|xz|zst)|ffpfsc|ffpfs|ffpkg|exfat|fpkg|pkg|zip|rar|7z|tar|tgz)(?:\.\d{3})?$/i;

export function filenameFormat(filename) {
  return EXTENSION.exec(filename || "")?.[1].toLowerCase() ?? null;
}

export function linkFormat(url) {
  if (!url) return null;
  const path = /^https?:\/\/[^/?#]+([^?#]*)/i.exec(url)?.[1];
  if (!path) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch (error) {
    console.log(`[source-format] invalid URL encoding: ${error.message}`);
    return null;
  }
  return filenameFormat(decoded.replace(/\/file\/?$/i, "").replace(/\.html?$/i, ""));
}

function formatOf(release) {
  const declared = (release.format || "").toLowerCase().replace(/^\./, "");
  const format = filenameFormat(`.${declared}`);
  if (format === declared) return format;
  return filenameFormat(release.filename) || linkFormat(release.url) || linkFormat(release.browserUrl);
}

export function sourceFormat(release) {
  if (!release) return t("sources.format.unknown");
  if (release.parts?.length) {
    const formats = release.parts.map((part) => {
      const known = part.sources.map(formatOf);
      return known.length && known.every((format) => format && format === known[0]) ? known[0] : null;
    });
    return formats.every((format) => format && format === formats[0])
      ? `.${formats[0].toUpperCase()}`
      : t("sources.format.unknown");
  }
  const format = formatOf(release);
  return format ? `.${format.toUpperCase()}` : t("sources.format.unknown");
}
