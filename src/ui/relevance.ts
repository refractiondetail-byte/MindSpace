import { tokenize } from '../core/search';
import { REGION_META, type Region, type ThoughtNode } from '../core/types';

/**
 * Live search relevance for the HUD. Scores every node as the query changes:
 * exact title/tag phrases, per-token title/content/tag matches, region/type
 * matches, and a small recency lift. Pure so the HUD and the 3D scene can share
 * exactly the same ranking.
 */

export interface RankedThought {
  node: ThoughtNode;
  score: number;
  /** 0…1 meter value derived from the absolute score. */
  relevance: number;
  /** Short human-readable reasons, most important first. */
  reasons: string[];
}

export interface RankOptions {
  query: string;
  region: Region | 'all';
  now?: Date;
}

/** 0 = no match, 3 = exact word. */
function matchToken(token: string, words: string[]): number {
  let best = 0;
  for (const word of words) {
    if (word === token) best = Math.max(best, 3);
    else if (word.startsWith(token)) best = Math.max(best, 2);
    else if (word.includes(token)) best = Math.max(best, 1);
  }
  return best;
}

/** Higher is better; `relevance` is capped at 100% around a strong match. */
const RELEVANCE_FLOOR = 32;

export function rankThoughts(
  thoughts: ThoughtNode[],
  { query, region, now = new Date() }: RankOptions,
): RankedThought[] {
  const tokens = tokenize(query);
  const trimmed = query.trim();
  const normalizedQuery = trimmed.toLowerCase().replace(/^#/, '');
  const isBrowsing = tokens.length === 0;
  const results: RankedThought[] = [];

  for (const node of thoughts) {
    if (region !== 'all' && node.region !== region) continue;

    if (isBrowsing) {
      // A malformed query made only of punctuation should not match everything.
      if (trimmed.length > 0) continue;
      results.push({ node, score: 0, relevance: 0, reasons: [] });
      continue;
    }

    const title = node.title.toLowerCase();
    const titleWords = tokenize(node.title);
    const contentWords = tokenize(node.content);
    const tagWords = node.tags.flatMap((tag) => tokenize(tag));
    const regionMeta = REGION_META[node.region];
    const regionWords = [
      ...tokenize(node.region),
      ...tokenize(regionMeta.label),
      ...tokenize(regionMeta.description),
    ];
    const typeWords = tokenize(node.type);

    const cleanedQuery = normalizedQuery.replace(/^#/, '');
    const exactTag = node.tags.find((tag) => tag.toLowerCase() === cleanedQuery);
    const reasons: string[] = [];
    let score = 0;

    if (cleanedQuery) {
      if (title === cleanedQuery) {
        score += 40;
        reasons.push('exact title');
      } else if (title.startsWith(cleanedQuery)) {
        score += 16;
        reasons.push('title prefix');
      } else if (title.includes(cleanedQuery)) {
        score += 8;
        reasons.push('title');
      }
    }

    if (exactTag) {
      score += 30;
      reasons.push(`tag #${exactTag}`);
    }

    let allTokensMatched = true;
    for (const token of tokens) {
      const titleMatch = matchToken(token, titleWords);
      const tagMatch = matchToken(token, tagWords);
      const contentMatch = matchToken(token, contentWords);
      const regionMatch = matchToken(token, regionWords);
      const typeMatch = matchToken(token, typeWords);

      const tokenScore = Math.max(
        titleMatch * 6,
        tagMatch * 4.5,
        contentMatch * 1.6,
        regionMatch * 2.4,
        typeMatch * 2.4,
      );

      if (tokenScore === 0) {
        allTokensMatched = false;
        break;
      }

      score += tokenScore;

      if (titleMatch >= 2) reasons.push('title');
      else if (tagMatch >= 2) reasons.push('tag');
      else if (regionMatch >= 2) reasons.push('region');
      else if (typeMatch >= 2) reasons.push('type');
      else if (contentMatch >= 2) reasons.push('content');
    }

    if (!allTokensMatched) continue;

    const createdAt = new Date(node.createdAt).getTime();
    const ageDays = Number.isNaN(createdAt)
      ? 30
      : Math.max(0, (now.getTime() - createdAt) / 86_400_000);
    const recency = Math.max(0, 2 - ageDays / 7);
    if (recency > 0) {
      score += recency;
      if (ageDays <= 3) reasons.push('recent');
    }

    const uniqueReasons = [...new Set(reasons)];
    const hasTitlePhrase =
      uniqueReasons.includes('exact title') ||
      uniqueReasons.includes('title prefix');
    const hasTagPhrase = uniqueReasons.some((reason) => reason.startsWith('tag #'));
    const cleanedReasons = uniqueReasons
      .filter((reason) => {
        if (reason === 'title') return !hasTitlePhrase;
        if (reason === 'tag') return !hasTagPhrase;
        return true;
      })
      .slice(0, 3);

    results.push({
      node,
      score,
      relevance: Math.min(1, score / RELEVANCE_FLOOR),
      reasons: cleanedReasons,
    });
  }

  results.sort((a, b) =>
    isBrowsing
      ? b.node.createdAt.localeCompare(a.node.createdAt)
      : b.score - a.score || b.node.createdAt.localeCompare(a.node.createdAt),
  );

  return results;
}
