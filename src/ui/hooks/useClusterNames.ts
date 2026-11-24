import { useCallback, useState } from 'react';
import type { Region } from '../../core/types';
import {
  DEFAULT_CLUSTER_NAMES,
  loadClusterNames,
  saveClusterNames,
} from '../../lib/clusterNames';

export function useClusterNames(): [
  Record<Region, string>,
  (region: Region, name: string) => void,
  (names: Record<Region, string>) => void,
] {
  const [names, setNames] = useState<Record<Region, string>>(() => loadClusterNames());

  const rename = useCallback((region: Region, name: string) => {
    setNames((prev) => {
      const next = { ...prev, [region]: name.trim() || DEFAULT_CLUSTER_NAMES[region] };
      saveClusterNames(next);
      return next;
    });
  }, []);

  const setAll = useCallback((next: Record<Region, string>) => {
    setNames(next);
    saveClusterNames(next);
  }, []);

  return [names, rename, setAll];
}
