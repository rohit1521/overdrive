import { useEffect, useState } from 'react';
import { Http } from '@ps5-react/core';
import { createSourceMetadata } from '../state/source-metadata.js';

const metadata = createSourceMetadata({ http: Http });

export function useSourceMetadata(releases) {
  const [, update] = useState(0);
  const key = releases.map((release) => release.id).join("/");
  useEffect(() => {
    const off = metadata.subscribe(() => update((version) => version + 1));
    void metadata.check(releases);
    return off;
  }, [key]);
  return { get: metadata.get, refresh: () => { void metadata.check(releases, true); } };
}
