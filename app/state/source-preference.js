import { useEffect, useState } from 'react';
import { FORMAT_PREFERENCES } from '../game/source-format.js';
import { loadList, saveList } from './saved.js';

let preferred = loadList("settings.json", "settings").sourceFormat || "all";
if (preferred === "images") preferred = "package";
else if (preferred === "packages") preferred = "pkg";
if (!FORMAT_PREFERENCES.includes(preferred)) {
  console.log("[sources] invalid format preference; using all formats");
  preferred = "all";
}
const listeners = new Set();
export const sourcePreference = () => preferred;
export function setSourcePreference(value) {
  if (!FORMAT_PREFERENCES.includes(value)) throw new Error("Unknown source format preference.");
  const settings = loadList("settings.json", "settings");
  saveList("settings.json", "settings", { ...settings, sourceFormat: value });
  preferred = value;
  for (const listener of listeners) listener(value);
}
export function useSourcePreference() {
  const [value, setValue] = useState(sourcePreference);
  useEffect(() => {
    listeners.add(setValue);
    setValue(preferred);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
