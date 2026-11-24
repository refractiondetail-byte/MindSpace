import type { Region } from '../core/types';
import { REGIONS } from '../core/types';

const STORAGE_KEY = 'mindspace:cluster-names';

export const DEFAULT_CLUSTER_NAMES: Record<Region, string> = REGIONS.reduce(
  (acc, region, index) => {
    acc[region] = `Cluster ${index + 1}`;
    return acc;
  },
  {} as Record<Region, string>,
);

export function loadClusterNames(): Record<Region, string> {
  const result: Record<Region, string> = { ...DEFAULT_CLUSTER_NAMES };
  if (typeof window === 'undefined') return result;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<Region, string>>;
      for (const region of REGIONS) {
        const value = parsed?.[region];
        if (typeof value === 'string' && value.trim()) {
          result[region] = value.trim();
        }
      }
    }
  } catch {
    // Ignore malformed storage.
  }
  return result;
}

export function saveClusterNames(names: Record<Region, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Ignore storage failures.
  }
}

export function getClusterName(names: Record<Region, string> | undefined, region: Region): string {
  const value = names?.[region];
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_CLUSTER_NAMES[region];
}
