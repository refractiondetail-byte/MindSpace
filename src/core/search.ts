import type { Region, ThoughtNode, ThoughtType } from './types';

export interface ThoughtFilters {
  /** Free text; every token must match somewhere in the node. */
  query?: string;
  regions?: Region[];
  types?: ThoughtType[];
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD');
}

/** Classic Levenshtein edit distance (small strings only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Single-token fuzzy score (0 = no match, 1 = weak/typo, 2 = prefix, 3 = exact).
 * Tolerates minor typos via edit distance and bidirectional substring overlap.
 */
export function fuzzyMatchToken(token: string, word: string): number {
  if (!token || !word) return 0;
  if (word === token) return 3;
  if (word.startsWith(token)) return 2;
  if (word.includes(token) || token.includes(word)) return 1;
  const maxDist = token.length < 5 ? 1 : 2;
  if (Math.abs(word.length - token.length) <= maxDist) {
    if (levenshtein(token, word) <= maxDist) return 1;
  }
  return 0;
}

export function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** 0 = no match, higher = better (exact > prefix > substring > typo). */
function matchToken(token: string, words: string[]): number {
  let best = 0;
  for (const word of words) {
    best = Math.max(best, fuzzyMatchToken(token, word));
  }
  return best;
}

export function scoreThought(thought: ThoughtNode, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const titleWords = tokenize(thought.title);
  const contentWords = tokenize(thought.content);
  const tagWords = thought.tags.flatMap((tag) => tokenize(tag));
  const metaWords = [thought.type, thought.region];

  let score = 0;
  for (const token of tokens) {
    const title = matchToken(token, titleWords);
    const tags = matchToken(token, tagWords);
    const content = matchToken(token, contentWords);
    const meta = matchToken(token, metaWords);

    const tokenScore = Math.max(title * 4, tags * 3, content * 2, meta * 2);
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score;
}

/**
 * Full-text + region/type filtering, ordered by relevance then recency.
 * Pure function so it can be reused by any world or HUD surface.
 */
export function filterThoughts(thoughts: ThoughtNode[], filters: ThoughtFilters = {}): ThoughtNode[] {
  const tokens = tokenize(filters.query ?? '');
  const regions = filters.regions && filters.regions.length > 0 ? new Set(filters.regions) : null;
  const types = filters.types && filters.types.length > 0 ? new Set(filters.types) : null;

  const scored: Array<{ thought: ThoughtNode; score: number }> = [];

  for (const thought of thoughts) {
    if (regions && !regions.has(thought.region)) continue;
    if (types && !types.has(thought.type)) continue;

    const score = scoreThought(thought, tokens);
    if (tokens.length > 0 && score === 0) continue;

    scored.push({ thought, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || b.thought.createdAt.localeCompare(a.thought.createdAt),
  );

  return scored.map((entry) => entry.thought);
}
