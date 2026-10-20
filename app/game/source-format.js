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

export function releaseFormat(release) {
  if (!release) return null;
  if (release.parts?.length) {
    const formats = release.parts.map((part) => {
      const known = part.sources.map(formatOf);
      return known.length && known.every((format) => format && format === known[0]) ? known[0] : null;
    });
    return formats.every((format) => format && format === formats[0]) ? formats[0] : null;
  }
  return formatOf(release);
}

export function sourceFormat(release) {
  const format = releaseFormat(release);
  return format ? `.${format.toUpperCase()}` : t("sources.format.unknown");
}

export const FORMAT_PREFERENCES = ["all", "exfat", "images", "packages", "archives"];
export const FORMAT_FILTERS = [...FORMAT_PREFERENCES, "unknown"];
export function formatLabel(value) {
  if (value === "exfat") return ".EXFAT";
  return t(value === "all" ? "sources.formatAll" : value === "unknown" ? "sources.format.unknown" :
    `sources.kind.${{ images: "image", packages: "package", archives: "archive" }[value]}`);
}
export function matchesFormat(release, filter, metadata) {
  if (filter === "all") return true;
  const format = metadata?.format || releaseFormat(release);
  if (filter === "exfat") return format === "exfat";
  if (filter === "images") return /^(exfat|ffpfsc|ffpfs|ffpkg)$/.test(format || "");
  if (filter === "packages") return /^(fpkg|pkg)$/.test(format || "");
  if (filter === "archives") return Boolean(release.parts?.length) || /^(zip|rar|7z|tar(?:\.(?:gz|bz2|xz|zst))?|tgz)$/.test(format || "");
  if (filter === "unknown") return !format && !release.parts?.length;
  throw new Error("Unknown source format filter.");
}
