// ../pub-game-store/native/files/scan.js
// reconstructed from the esbuild bundle in eboot.bin


  var KINDS = [
    { key: "packages", icon: "package", folders: ["downloads/packages"] },
    { key: "images", icon: "disc", folders: ["homebrew"] },
    { key: "archives", icon: "archive", folders: ["downloads/archives", "downloads/sets"] },
    { key: "extracted", icon: "folder", folders: ["downloads/extracted"] },
    { key: "other", icon: "file", folders: ["downloads/files"] }
  ];
  var SIDECAR = /\.(?:complete|part|resume|tmp)$|^\.ps5-react-/;
  var TITLE_ID = /\b(CUSA|PPSA)\d{5}\b/;
  var DEPTH = 4;
  var ENTRIES = 4e3;
  var isPackage = (name) => /\.f?pkg$/i.test(name);
  async function scanDrive(fs, root2, { signal, onProgress, wait = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
    const files = [];
    const errors = [];
    let visited = 0, since = 0, started = Date.now(), partial = false;
    const cancelled = () => {
      if (signal?.aborted) throw new Error("File scan cancelled.");
    };
    const pace = async () => {
      cancelled();
      if (visited - since >= 64 || Date.now() - started >= 8) {
        onProgress?.(visited);
        await wait();
        cancelled();
        since = visited;
        started = Date.now();
      }
    };
    const spend = () => {
      if (visited >= ENTRIES) { partial = true; return false; }
      visited++;
      return true;
    };
    const read = (path, optional = false) => {
      if (optional && !fs.exists(path)) return [];
      try { return fs.readDir(path); } catch (error) {
        partial = true;
        errors.push(`${path}: ${error.message}`);
        console.log(`[files] scan failed: ${path}: ${error.message}`);
        return null;
      }
    };
    async function folderSize(path, depth) {
      const result = { size: 0, approximate: false };
      await pace();
      if (visited >= ENTRIES) { partial = result.approximate = true; return result; }
      const entries = read(path);
      if (!entries) return { size: 0, approximate: true };
      for (const entry of entries) {
        await pace();
        if (!spend()) { result.approximate = true; break; }
        if (entry.isDirectory) {
          if (depth > 0) {
            const nested = await folderSize(`${path}/${entry.name}`, depth - 1);
            result.size += nested.size;
            result.approximate ||= nested.approximate;
          } else partial = result.approximate = true;
        } else result.size += entry.size || 0;
      }
      return result;
    }
    await wait();
    cancelled();
    if (!fs.stat(root2)?.isDirectory) throw new Error(`Storage is unavailable: ${root2}`);
    for (const kind of KINDS) {
      for (const folder of kind.folders) {
        await pace();
        if (visited >= ENTRIES) { partial = true; break; }
        const entries2 = read(`${root2}/${folder}`, true);
        for (const entry2 of entries2 || []) {
          await pace();
          if (!spend()) break;
          if (SIDECAR.test(entry2.name)) continue;
          const path = `${root2}/${folder}/${entry2.name}`;
          const titleId = TITLE_ID.exec(entry2.name)?.[0] ?? null;
          files.push({
            kind: kind.key,
            path,
            name: entry2.name,
            isDirectory: entry2.isDirectory,
            modified: entry2.modified,
            size: entry2.isDirectory ? 0 : entry2.size || 0,
            approximate: Boolean(entry2.isDirectory),
            titleId,
            platform: titleId ? titleId.startsWith("CUSA") ? "ps4" : "ps5" : null
          });
        }
      }
    }
    for (const file of files) if (file.isDirectory) Object.assign(file, await folderSize(file.path, DEPTH));
    cancelled();
    return { files: files.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)), partial, errors, visited };
  }
  function totals(files, partial = false) {
    const out = Object.fromEntries([["all", { count: 0, size: 0 }], ...KINDS.map((kind) => [kind.key, { count: 0, size: 0 }])]);
    for (const entry of Object.values(out)) entry.approximate = partial;
    for (const file of files) for (const key of ["all", file.kind]) {
      out[key].count++;
      out[key].size += file.size;
      out[key].approximate ||= file.approximate;
    }
    return out;
  }
  var deletionTargets = (file) => file.isDirectory ? [file.path] : [file.path, ...[".complete", ".resume", ".part"].map((suffix) => file.path + suffix)];

export { KINDS, deletionTargets, isPackage, scanDrive, totals };
