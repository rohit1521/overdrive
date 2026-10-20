import { useEffect, useState } from 'react';
import { Http } from '@ps5-react/core';
import { createSourceMetadata } from '../state/source-metadata.js';

const metadata = createSourceMetadata({ http: Http });

export function useSourceMetadata(releases, selectedId) {
  const [, update] = useState(0);
  const key = releases.map((release) => release.id).join("/");
  useEffect(() => {
    const selected = releases.find((release) => release.id === selectedId);
    const ordered = selected ? [selected, ...releases.filter((release) => release !== selected)] : releases;
    return metadata.watch(ordered, () => update((version) => version + 1));
  }, [key]);
  useEffect(() => {
    metadata.prioritize(releases.find((release) => release.id === selectedId));
  }, [key, selectedId]);
  return { get: metadata.get, refresh: () => { void metadata.check(releases, true); } };
}
