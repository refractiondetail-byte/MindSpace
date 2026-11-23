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

export function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** 0 = no match, higher = better (exact > prefix > substring). */
function matchToken(token: string, words: string[]): number {
  let best = 0;
  for (const word of words) {
    if (word === token) best = Math.max(best, 3);
    else if (word.startsWith(token)) best = Math.max(best, 2);
    else if (word.includes(token)) best = Math.max(best, 1);
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
