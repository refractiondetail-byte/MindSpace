import { useEffect, useState, type FormEvent } from 'react';
import { createThought, normalizeTags } from '../../core/repository';
import type { ThoughtNode } from '../../core/types';
import { relativeTime, sameLocalDay, useNow } from '../time';

const MOOD_OPTIONS = [
  { value: -4, emoji: '😞', label: 'Rough' },
  { value: -2, emoji: '😕', label: 'Low' },
  { value: 0, emoji: '😐', label: 'Okay' },
  { value: 2, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '😄', label: 'Great' },
] as const;

const DISMISS_KEY = 'mindspace:checkin:dismissed';

function dismissKeyForToday(): string {
  const today = new Date();
  return `${DISMISS_KEY}:${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

interface CheckInFormProps {
  onSaved: (node: ThoughtNode) => void;
  compact?: boolean;
}

/** Shared check-in form used by the floating nudge and the Mind Pulse panel. */
export function CheckInForm({ onSaved, compact = false }: CheckInFormProps) {
  const [mood, setMood] = useState<number | null>(null);
  const [unit, setUnit] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem('mindspace:last-unit') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const id = window.setTimeout(() => setJustSaved(false), 4000);
    return () => window.clearTimeout(id);
  }, [justSaved]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUnit = normalizeTags([unit])[0] ?? '';

    if (mood === null && !cleanUnit) {
      setError('Pick a mood or name a unit first.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const moodLabel = MOOD_OPTIONS.find((option) => option.value === mood)?.label;
      const trackingMood = mood !== null;

      const node = await createThought({
        title: trackingMood
          ? 'Daily check-in'
          : `Working on ${cleanUnit}`,
        content: [
          moodLabel ? `Feeling ${moodLabel.toLowerCase()} today.` : '',
          cleanUnit ? `Focus: ${cleanUnit}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        type: trackingMood ? 'feeling' : 'thought',
        region: trackingMood ? 'limbic' : 'prefrontal',
        tags: cleanUnit ? [cleanUnit] : [],
        moodScore: mood,
      });

      if (cleanUnit) {
        try {
          window.localStorage.setItem('mindspace:last-unit', cleanUnit);
        } catch {
          // Storage is optional; the check-in itself is already saved.
        }
      }

      setMood(null);
      setUnit(cleanUnit);
      setJustSaved(true);
      onSaved(node);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this check-in.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className={compact ? 'mt-2 flex flex-col gap-2' : 'mt-3 flex flex-col gap-2.5'}
    >
      <div className="flex gap-1" role="group" aria-label="How are you feeling?">
        {MOOD_OPTIONS.map((option) => {
          const active = mood === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              title={option.label}
              onClick={() => {
                setMood(active ? null : option.value);
                setError(null);
                setJustSaved(false);
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-1 py-1 text-[9px] transition ${
                active
                  ? 'border-white/25 bg-white/15 text-white'
                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              <span className="text-sm leading-none" aria-hidden>
                {option.emoji}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        <input
          className="field !px-2.5 !py-1.5 text-xs"
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value);
            setError(null);
          }}
          placeholder="Unit or topic today (e.g. cs 340)"
          aria-label="Unit or topic"
          maxLength={48}
        />
        <button
          type="submit"
          disabled={busy || (mood === null && !unit.trim())}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--hud-accent)' }}
        >
          {busy ? '…' : 'Log'}
        </button>
      </div>

      {error && <p className="text-[10px] text-rose-300">{error}</p>}
      {justSaved && (
        <p className="text-[10px] text-emerald-300">Saved to your brain.</p>
      )}
    </form>
  );
}

interface DailyCheckInProps {
  thoughts: ThoughtNode[];
  onSaved: (node: ThoughtNode) => void;
  onCapture: () => void;
  className?: string;
}

/**
 * Non-intrusive daily nudge: one tap for mood, one field for today's unit, and
 * a reminder when recent notes are still sitting outside the brain.
 */
export function DailyCheckIn({
  thoughts,
  onSaved,
  onCapture,
  className = '',
}: DailyCheckInProps) {
  const now = useNow(30_000);
  const [snoozed, setSnoozed] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(dismissKeyForToday()) === '1';
    } catch {
      return false;
    }
  });

  if (snoozed || dismissed) return null;

  const lastCapture = thoughts.reduce<string | null>(
    (latest, node) =>
      latest === null || node.createdAt > latest ? node.createdAt : latest,
    null,
  );
  const moodToday = thoughts.some(
    (node) => node.moodScore !== null && sameLocalDay(node.createdAt, now),
  );
  const staleDays = lastCapture
    ? (now.getTime() - new Date(lastCapture).getTime()) / 86_400_000
    : Infinity;

  const prompt = !lastCapture
    ? 'Your brain is empty — capture the note that has been circling your head.'
    : staleDays >= 2
      ? `Last capture ${relativeTime(lastCapture, now)} — anything still sitting outside your brain?`
      : !moodToday
        ? 'No mood logged today. A ten-second check-in is enough.'
        : 'What are you working on today? Tag the unit so this week has shape.';

  function dismissForToday() {
    try {
      window.localStorage.setItem(dismissKeyForToday(), '1');
    } catch {
      // Ignore storage failures; dismissing still hides the card this session.
    }
    setDismissed(true);
  }

  return (
    <div className={`hud-panel p-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Gentle nudge
        </p>
        <button
          type="button"
          onClick={dismissForToday}
          aria-label="Dismiss check-in for today"
          className="-mr-1 -mt-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:text-white"
        >
          ✕
        </button>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{prompt}</p>

      <CheckInForm onSaved={onSaved} compact />

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCapture}
          className="text-[11px] font-medium transition hover:brightness-110"
          style={{ color: 'var(--hud-accent)' }}
        >
          ＋ Capture a note
        </button>
        <button
          type="button"
          onClick={() => setSnoozed(true)}
          className="text-[10px] text-slate-500 transition hover:text-slate-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
