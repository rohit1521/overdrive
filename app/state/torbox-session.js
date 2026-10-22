import { useEffect, useState } from 'react';
import { FileSystem, Http } from '@ps5-react/core';
import { createTorBox } from './torbox.js';
import { createTorBoxKeyStore } from './torbox-key.js';
import { createTorBoxHosts } from './torbox-hosts.js';
import { loadList, saveList } from './saved.js';
import { t } from '../i18n/core.js';
import { sourceKind } from './download-sources.js';

export const torboxHosts = createTorBoxHosts({
  http: Http, disabled: loadList("settings.json", "settings").torboxDisabledHosts,
  persist: (disabled) => {
    if (!saveList("settings.json", "settings", { ...loadList("settings.json", "settings"), torboxDisabledHosts: disabled })) {
      throw new Error(t("torbox.hostSaveFailed"));
    }
  }
});
export const torboxClient = createTorBox({ http: Http, key: () => store.get(), hosts: torboxHosts });
const store = createTorBoxKeyStore({ fs: FileSystem, directory: `${FileSystem.dataDir}/overdrive`, validate: torboxClient.validate });
export const torboxKey = store.get;
export const torboxError = store.error;
export const setTorBoxKey = store.save;
export const clearTorBoxKey = store.clear;
export function useTorBox() {
  const [enabled, setEnabled] = useState(() => Boolean(store.get()));
  useEffect(() => {
    const off = store.subscribe(setEnabled);
    setEnabled(Boolean(store.get()));
    return off;
  }, []);
  return enabled;
}

export function useTorBoxHosts() {
  const [state, setState] = useState(torboxHosts.get);
  useEffect(() => {
    const off = torboxHosts.subscribe(() => setState(torboxHosts.get()));
    void torboxHosts.load();
    return off;
  }, []);
  return { ...state, refresh: () => { void torboxHosts.load(true); }, toggle: torboxHosts.toggle };
}

export function canUseTorBox(release) {
  const enabled = torboxClient.enabled();
  const sources = release?.parts?.flatMap((part) => part.sources) ?? (release ? [release] : []);
  return enabled && sources.length > 0 && sources.every((source) => torboxHosts.supports(source) &&
    !["direct", "manifest", "unavailable"].includes(sourceKind(source)));
}

export function useTorBoxRouting() {
  useTorBox();
  useTorBoxHosts();
  return canUseTorBox;
}
