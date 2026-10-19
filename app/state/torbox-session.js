import { useEffect, useState } from 'react';
import { FileSystem, Http } from '@ps5-react/core';
import { createTorBox } from './torbox.js';
import { createTorBoxKeyStore } from './torbox-key.js';

const client = createTorBox({ http: Http, key: () => store.get() });
const store = createTorBoxKeyStore({ fs: FileSystem, directory: `${FileSystem.dataDir}/overdrive`, validate: client.validate });
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
