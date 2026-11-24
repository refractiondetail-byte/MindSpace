import type { Region, ThoughtNode } from '../core/types';

export interface MoodPoint {
  key: string;
  label: string;
  /** Daily mean of tracked moods, or null when nothing was logged. */
  average: number | null;
  count: number;
}

export interface ActivityPoint {
  key: string;
  label: string;
  count: number;
}

export interface WeekSummary {
  total: number;
  today: number;
  regions: Record<Region, number>;
  tags: Array<{ tag: string; count: number }>;
  moods: number;
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Oldest → newest daily capture counts for the last `days` days. */
export function buildActivitySeries(
  thoughts: ThoughtNode[],
  now: Date = new Date(),
  days = 14,
): ActivityPoint[] {
  const counts = new Map<string, number>();
  for (const node of thoughts) {
    const created = new Date(node.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const key = localDayKey(created);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: ActivityPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDayKey(date);
    points.push({
      key,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: counts.get(key) ?? 0,
    });
  }
  return points;
}

/** Oldest → newest daily mood averages for the last `days` days. */
export function buildMoodSeries(
  thoughts: ThoughtNode[],
  now: Date = new Date(),
  days = 14,
): MoodPoint[] {
  const points: MoodPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDayKey(date);
    let sum = 0;
    let count = 0;

    for (const node of thoughts) {
      if (node.moodScore === null) continue;
      const created = new Date(node.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      if (localDayKey(created) !== key) continue;
      sum += node.moodScore;
      count += 1;
    }

    points.push({
      key,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      average: count > 0 ? sum / count : null,
      count,
    });
  }

  return points;
}

/** Rolling last-seven-days snapshot used by the Mind Pulse panel. */
export function summarizeWeek(
  thoughts: ThoughtNode[],
  now: Date = new Date(),
): WeekSummary {
  const since = now.getTime() - 7 * 86_400_000;
  const todayKey = localDayKey(now);
  const regions: Record<Region, number> = {
    prefrontal: 0,
    hippocampus: 0,
    limbic: 0,
    parietal: 0,
  };
  const tagCounts = new Map<string, number>();
  let total = 0;
  let today = 0;
  let moods = 0;

  for (const node of thoughts) {
    const created = new Date(node.createdAt);
    if (Number.isNaN(created.getTime())) continue;

    if (localDayKey(created) === todayKey) today += 1;

    if (created.getTime() < since) continue;
    total += 1;
    regions[node.region] += 1;
    if (node.moodScore !== null) moods += 1;
    for (const tag of node.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 6);

  return { total, today, regions, tags, moods };
}

/** Latest visit among the nodes that carry a tag, i.e. when the unit was touched. */
export function lastVisitForTag(
  tag: string,
  thoughts: ThoughtNode[],
  visits: Record<string, string>,
): string | null {
  let latest = 0;

  for (const node of thoughts) {
    if (!node.tags.includes(tag)) continue;
    const iso = visits[node.id];
    if (!iso) continue;
    const time = new Date(iso).getTime();
    if (Number.isFinite(time)) latest = Math.max(latest, time);
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

export interface TodayMoodEstimate {
  score: number;
  label: string;
  source: string | null;
}

const POSITIVE_WORDS = [
  'good', 'great', 'happy', 'calm', 'excited', 'productive', 'proud', 'love',
  'progress', 'win', 'success', 'clear', 'focused', 'grateful', 'energized',
  'hopeful', 'relaxed', 'confident',
];
const NEGATIVE_WORDS = [
  'bad', 'sad', 'anxious', 'stressed', 'tired', 'angry', 'frustrated',
  'overwhelmed', 'lonely', 'worried', 'depressed', 'exhausted', 'stuck',
  'confused', 'burnout', 'panic', 'sadness', 'fear',
];

export function estimateMoodFromText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) score -= 1;
  }
  return Math.max(-5, Math.min(5, score));
}

export function moodLabel(score: number): string {
  if (score >= 4) return 'Radiant';
  if (score >= 2) return 'Positive';
  if (score >= 1) return 'Okay';
  if (score === 0) return 'Neutral';
  if (score >= -1) return 'Low';
  if (score >= -3) return 'Stressed';
  return 'Heavy';
}

/** Estimate today's feeling from the most recent note (or its tracked mood). */
export function estimateTodayMood(
  thoughts: ThoughtNode[],
  now: Date = new Date(),
): TodayMoodEstimate {
  const todayKey = localDayKey(now);
  const todays = thoughts
    .filter((node) => localDayKey(new Date(node.createdAt)) === todayKey)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const node =
    todays[0] ??
    [...thoughts].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0] ??
    null;

  if (!node) {
    return { score: 0, label: 'No data', source: null };
  }

  const score =
    node.moodScore !== null
      ? node.moodScore
      : estimateMoodFromText(`${node.title} ${node.content}`);
  return { score, label: moodLabel(score), source: node.title || null };
}

/** Most recent visit across every node. */
export function latestVisit(visits: Record<string, string>): string | null {
  let latest = 0;
  for (const iso of Object.values(visits)) {
    const time = new Date(iso).getTime();
    if (Number.isFinite(time)) latest = Math.max(latest, time);
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}
