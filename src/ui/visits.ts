const STORAGE_KEY = 'mindspace:visits:v1';

/** Last time each node was opened in the inspector, persisted locally. */
export function loadVisits(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const visits: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') visits[id] = value;
    }
    return visits;
  } catch {
    return {};
  }
}

export function recordVisit(id: string, at: Date = new Date()): Record<string, string> {
  const next = { ...loadVisits(), [id]: at.toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full storage quota: the in-memory tracker still works.
  }
  return next;
}
