// ../pub-game-store/native/downloads/format.js
// reconstructed from the esbuild bundle in eboot.bin

import { formatNumber2, t } from '../i18n/core.js';

  var shownFormat = (job) => {
    const format = job.artifact?.format || job.release?.format;
    if (format && format !== "binary") return format;
    return job.inspected || /\.(exfat|ffpfsc|ffpfs|ffpkg|fpkg|pkg|rar|7z|zip)$/i.exec(job.fileName || "")?.[1] || "";
  };
  var downloadMeta = (job) => [
    shownFormat(job).toUpperCase(),
    (job.parts ? job.parts[job.partIndex]?.torbox : job.torbox) ? "TorBox" : job.release?.provider,
    job.root
  ].filter(Boolean).join(" \xB7 ");
  var shapeOf = (job) => JSON.stringify([job.id, job.state, job.phase, job.error, job.message,
    job.total, downloadMeta(job), job.titleMismatch]);
  var formatSpeed = (bytesPerSecond) => t("units.speed", { n: formatNumber2(bytesPerSecond / 1024 ** 2, { minimumFractionDigits: 1, useGrouping: false }) });
  function formatDuration(seconds2) {
    if (seconds2 < 59.5) return t("time.seconds", { n: Math.max(1, Math.round(seconds2)) });
    const minutes = Math.round(seconds2 / 60);
    if (minutes < 60) return t("time.minutes", { n: minutes });
    return t("time.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  }
  var formatTimeLeft = (seconds2) => t("downloads.timeLeft", { time: formatDuration(seconds2) });

export { downloadMeta, formatDuration, formatSpeed, formatTimeLeft, shapeOf, shownFormat };
