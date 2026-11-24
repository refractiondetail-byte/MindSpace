import { useMemo } from 'react';
import { REGIONS, REGION_META, type ThoughtNode } from '../../core/types';
import { loadClusterNames } from '../../lib/clusterNames';
import {
  buildActivitySeries,
  buildMoodSeries,
  lastVisitForTag,
  latestVisit,
  summarizeWeek,
  type ActivityPoint,
  type MoodPoint,
} from '../insights';
import {
  formatClock,
  formatLongDate,
  formatSession,
  relativeTime,
  SESSION_STARTED_AT,
  useNow,
} from '../time';
import { CheckInForm } from './DailyCheckIn';

interface MindPulseProps {
  thoughts: ThoughtNode[];
  visits: Record<string, string>;
  onClose: () => void;
  onSaved: (node: ThoughtNode) => void;
  onCapture: () => void;
  onPick: (node: ThoughtNode) => void;
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

/** Toggleable daily companion: clock, mood trend, this week's units and a check-in. */
export function MindPulse({
  thoughts,
  visits,
  onClose,
  onSaved,
  onCapture,
  onPick,
}: MindPulseProps) {
  const now = useNow(1000);
  const moodPoints = useMemo(() => buildMoodSeries(thoughts, now, 14), [thoughts, now]);
  const activity = useMemo(() => buildActivitySeries(thoughts, now, 14), [thoughts, now]);
  const week = useMemo(() => summarizeWeek(thoughts, now), [thoughts, now]);
  const lastTouch = latestVisit(visits);

  const totalLinks = useMemo(() => {
    const pairs = new Set<string>();
    for (const node of thoughts) {
      for (const targetId of node.links) {
        if (targetId === node.id) continue;
        pairs.add(node.id < targetId ? `${node.id}|${targetId}` : `${targetId}|${node.id}`);
      }
    }
    return pairs.size;
  }, [thoughts]);

  const updatedThisWeek = useMemo(() => {
    const since = now.getTime() - 7 * 86_400_000;
    return thoughts.filter((node) => {
      const created = new Date(node.createdAt).getTime();
      if (Number.isFinite(created) && created >= since) return true;
      const touched = visits[node.id] ? new Date(visits[node.id]).getTime() : NaN;
      return Number.isFinite(touched) && touched >= since;
    }).length;
  }, [thoughts, visits, now]);

  const mostConnected = useMemo(() => {
    const neighbors = new Map<string, Set<string>>();
    for (const node of thoughts) neighbors.set(node.id, new Set());
    for (const node of thoughts) {
      for (const targetId of node.links) {
        if (targetId === node.id || !neighbors.has(targetId)) continue;
        neighbors.get(node.id)?.add(targetId);
        neighbors.get(targetId)?.add(node.id);
      }
    }
    return thoughts
      .map((node) => ({ node, degree: neighbors.get(node.id)?.size ?? 0 }))
      .filter((entry) => entry.degree > 0)
      .sort((a, b) => b.degree - a.degree || a.node.title.localeCompare(b.node.title))
      .slice(0, 4);
  }, [thoughts]);

  const moodEntries = moodPoints.reduce((sum, point) => sum + point.count, 0);
  const moodSum = moodPoints.reduce(
    (sum, point) => sum + (point.average ?? 0) * point.count,
    0,
  );
  const moodAverage = moodEntries > 0 ? moodSum / moodEntries : null;
  const maxRegion = Math.max(...REGIONS.map((region) => week.regions[region]), 1);

  return (
    <aside
      role="dialog"
      aria-label="Overview dashboard"
      className="hud-panel absolute inset-x-3 bottom-3 z-20 flex max-h-[72dvh] flex-col overflow-hidden sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[min(364px,calc(100vw-1.5rem))] md:bottom-auto md:top-[4.5rem] md:max-h-[calc(100dvh-6rem)]"
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
            Overview
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Your brain at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mind pulse"
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-white/25 hover:text-white"
        >
          ✕
        </button>
      </header>

      <div
        className="scroll-thin flex flex-col gap-3.5 overflow-y-auto border-t px-4 pb-4 pt-3"
        style={{ borderColor: 'var(--hud-border)' }}
      >
        <section className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-semibold leading-none tracking-tight text-white">
              {formatClock(now)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">{formatLongDate(now)}</p>
          </div>
          <div className="text-right text-[10px] leading-relaxed text-slate-500">
            <p>
              session{' '}
              <span className="font-mono text-slate-300">
                {formatSession(now.getTime() - SESSION_STARTED_AT)}
              </span>
            </p>
            <p>
              last touch{' '}
              <span className="text-slate-300">
                {lastTouch ? relativeTime(lastTouch, now) : '—'}
              </span>
            </p>
            <p>
              <span className="text-slate-300">{week.today}</span> captured today
            </p>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-1.5">
          <Stat label="nodes" value={thoughts.length} />
          <Stat label="links" value={totalLinks} />
          <Stat label="updated 7d" value={updatedThisWeek} />
          <Stat label="types" value={new Set(thoughts.map((node) => node.type)).size} />
          <Stat label="regions" value={new Set(thoughts.map((node) => node.region)).size} />
          <Stat label="7d %" value={thoughts.length > 0 ? (updatedThisWeek / thoughts.length) * 100 : 0} renderPercent />
        </section>

        <section
          className="border-t pt-3"
          style={{ borderColor: 'var(--hud-border)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Mood & activity · 14 days
            </h3>
            <span className="text-[10px] text-slate-500">
              {moodEntries} {moodEntries === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {moodAverage !== null ? (
            <p className="mt-1.5 flex items-baseline gap-2">
              <span
                className={`text-lg font-semibold ${
                  moodAverage >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {moodAverage > 0 ? '+' : ''}
                {moodAverage.toFixed(1)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                average mood
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Nothing logged yet — the check-in below takes ten seconds.
            </p>
          )}

          <ActivityBars points={activity} />
          <MoodTrend points={moodPoints} />
        </section>

        <section
          className="border-t pt-3"
          style={{ borderColor: 'var(--hud-border)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              This week
            </h3>
            <span className="text-[10px] text-slate-500">
              {week.total} {week.total === 1 ? 'capture' : 'captures'} · last 7 days
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            {REGIONS.map((region) => {
              const meta = REGION_META[region];
              const count = week.regions[region];
              return (
                <div key={region} className="flex items-center gap-2 text-[10px]">
                  <span className="w-[74px] shrink-0 truncate text-slate-400">
                    {loadClusterNames()[region] ?? meta.label}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(count / maxRegion) * 100}%`,
                        backgroundColor: meta.accent,
                      }}
                    />
                  </span>
                  <span className="w-4 text-right font-medium text-slate-300">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
              Breakdown by group
            </p>
            {week.tags.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                No tagged work this week yet.
              </p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-2">
                {week.tags.map(({ tag, count }) => {
                  const touched = lastVisitForTag(tag, thoughts, visits);
                  return (
                    <li key={tag}>
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate text-slate-300">#{tag}</span>
                        <span className="shrink-0 text-[10px] text-slate-500">
                          {count} · {touched ? relativeTime(touched, now) : 'unopened'}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / week.tags[0].count) * 100}%`,
                            backgroundColor: 'var(--hud-accent)',
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section
          className="border-t pt-3"
          style={{ borderColor: 'var(--hud-border)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Most connected
            </h3>
            <span className="text-[10px] text-slate-500">{totalLinks} explicit links</span>
          </div>
          {mostConnected.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-500">
              No explicit links yet — connect two thoughts to start a constellation.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {mostConnected.map(({ node, degree }) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => onPick(node)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: REGION_META[node.region].accent }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                      {node.title}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                      {degree} {degree === 1 ? 'link' : 'links'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="border-t pt-3"
          style={{ borderColor: 'var(--hud-border)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Check in
            </h3>
            <span className="text-[10px] text-slate-500">
              {week.moods} mood {week.moods === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <CheckInForm onSaved={onSaved} compact />
          <button
            type="button"
            onClick={onCapture}
            className="mt-2 text-[11px] font-medium transition hover:brightness-110"
            style={{ color: 'var(--hud-accent)' }}
          >
            ＋ Capture a note instead
          </button>
        </section>

        <p className="text-center text-[9px] uppercase tracking-[0.2em] text-slate-600">
          local only · never leaves this device
        </p>
      </div>
    </aside>
  );
}

function Stat({ label, value, renderPercent }: { label: string; value: number; renderPercent?: boolean }) {
  const accent = label === 'nodes'
    ? REGION_META.prefrontal.accent
    : label === 'links'
      ? REGION_META.parietal.accent
      : label === 'updated 7d'
        ? REGION_META.limbic.accent
        : label === '7d %'
          ? REGION_META.hippocampus.accent
          : 'var(--hud-accent)';

  return (
    <div className="col-span-1 rounded-xl border border-white/5 bg-white/[0.03] p-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xl font-semibold leading-none text-white tabular-nums">{value}</p>
        {renderPercent && (
          <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
            {formatPercent(value)}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full"
            style={{
              width: `${renderPercent ? Math.max(2, Number(value)) : Math.min(100, Number(value))}%`,
              backgroundColor: String(accent),
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ActivityBars({ points }: { points: ActivityPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
          Captures
        </p>
        <span className="text-[9px] text-slate-600">{total} total</span>
      </div>
      <div
        className="mt-1 flex h-7 items-stretch gap-[2px]"
        role="img"
        aria-label="Daily captures over the last 14 days"
      >
        {points.map((point) => (
          <span
            key={point.key}
            className="relative flex-1 overflow-hidden rounded-sm bg-white/[0.03]"
            title={`${point.label}: ${point.count} ${point.count === 1 ? 'capture' : 'captures'}`}
          >
            <span
              className="absolute inset-x-0 bottom-0 rounded-sm"
              style={{
                height: `${Math.max(point.count > 0 ? 12 : 3, (point.count / max) * 100)}%`,
                backgroundColor: 'var(--hud-accent)',
                opacity: point.count > 0 ? 0.55 : 0.14,
              }}
            />
          </span>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] uppercase tracking-[0.14em] text-slate-600">
        <span>{points[0]?.label}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function MoodTrend({ points }: { points: MoodPoint[] }) {
  const width = 324;
  const height = 60;
  const middle = height / 2;
  const step = width / Math.max(1, points.length);

  return (
    <div className="mt-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full"
        role="img"
        aria-label="Daily mood over the last 14 days"
      >
        <line
          x1={0}
          x2={width}
          y1={middle}
          y2={middle}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        {points.map((point, index) => {
          const x = index * step + step / 2;
          if (point.average === null) {
            return (
              <circle
                key={point.key}
                cx={x}
                cy={middle}
                r={1.1}
                fill="rgba(148,163,184,0.35)"
              >
                <title>{`${point.label}: no mood logged`}</title>
              </circle>
            );
          }

          const magnitude = Math.max(
            2,
            (Math.abs(point.average) / 5) * (middle - 7),
          );
          const y = point.average >= 0 ? middle - magnitude : middle;
          return (
            <rect
              key={point.key}
              x={x - 4.5}
              y={y}
              width={9}
              height={magnitude}
              rx={2.5}
              fill={point.average >= 0 ? '#34d399' : '#fb7185'}
              opacity={0.72}
            >
              <title>
                {`${point.label}: ${point.average > 0 ? '+' : ''}${point.average.toFixed(
                  1,
                )} (${point.count})`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] uppercase tracking-[0.14em] text-slate-600">
        <span>{points[0]?.label}</span>
        <span>today</span>
      </div>
    </div>
  );
}
