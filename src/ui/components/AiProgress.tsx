import { useEffect, useRef, useState } from 'react';

export type AiJobMode = 'synthesis' | 'gaps';

interface StageContext {
  topic: string;
  count: number;
}

interface Stage {
  label: string;
  detail: (context: StageContext) => string;
}

const SYNTHESIS_STEPS: Stage[] = [
  {
    label: 'Gather topic notes',
    detail: ({ topic }) => `Collecting every note filed under “${topic}”`,
  },
  {
    label: 'Read & distill',
    detail: ({ count }) => `Reading ${count} ${count === 1 ? 'note' : 'notes'} and their extracted text`,
  },
  {
    label: 'Synthesize overview',
    detail: () => 'Weaving the notes into one master overview',
  },
  {
    label: 'Extract takeaways',
    detail: () => 'Pulling out the points worth remembering',
  },
  {
    label: 'Surface open questions',
    detail: () => 'Listing what still needs an answer',
  },
];

const GAP_STEPS: Stage[] = [
  {
    label: 'Gather topic notes',
    detail: ({ topic }) => `Collecting every note filed under “${topic}”`,
  },
  {
    label: 'Map covered concepts',
    detail: ({ count }) => `Mapping what ${count} ${count === 1 ? 'note has' : 'notes have'} already covered`,
  },
  {
    label: 'Detect thin areas',
    detail: () => 'Finding missing concepts and spots that need depth',
  },
  {
    label: 'Draft follow-ups',
    detail: () => 'Writing questions that would fill the gaps',
  },
];

/** Milliseconds after start at which each stage becomes current. */
const SYNTHESIS_DELAYS = [0, 1500, 4500, 7500, 11000];
const GAP_DELAYS = [0, 1500, 4500, 8000];

/** Rough expected duration, used only to creep the progress bar. */
const EXPECTED_MS: Record<AiJobMode, number> = { synthesis: 20000, gaps: 14000 };

export function AiProgressScreen({
  mode,
  topic,
  itemCount,
  done,
}: {
  mode: AiJobMode;
  topic: string;
  itemCount: number;
  /** True once the AI response has landed; all stages show complete. */
  done: boolean;
}) {
  const steps = mode === 'synthesis' ? SYNTHESIS_STEPS : GAP_STEPS;
  const [stage, setStage] = useState(0);
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setStage(0);
    startedAtRef.current = Date.now();
    const delays = mode === 'synthesis' ? SYNTHESIS_DELAYS : GAP_DELAYS;
    const timers = delays
      .slice(1)
      .map((delay, index) => window.setTimeout(() => setStage(index + 1), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mode]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setElapsed(Date.now() - startedAtRef.current),
      200,
    );
    return () => window.clearInterval(interval);
  }, []);

  const seconds = Math.floor(elapsed / 1000);
  const creep = Math.min(0.92, elapsed / EXPECTED_MS[mode]);
  const progress = done ? 1 : creep;
  const currentStage = Math.min(stage, steps.length - 1);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
    >
      <div className="w-[min(94vw,440px)] overflow-hidden rounded-2xl border border-[#1f1f1f] bg-[#09090b] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="relative h-px w-full overflow-hidden bg-white/5">
          <div className="import-progress__shimmer absolute inset-y-0 w-full" />
        </div>

        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center gap-2">
            <span
              className={`import-progress__dot h-2 w-2 rounded-full ${
                done ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              {done
                ? mode === 'synthesis'
                  ? 'Synthesis ready'
                  : 'Gap scan ready'
                : mode === 'synthesis'
                  ? 'Synthesizing topic'
                  : 'Scanning for gaps'}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-500">
              {done ? 'done' : `${seconds}s`}
            </span>
          </div>

          <h2 className="mt-2 truncate text-base font-semibold leading-snug text-zinc-100">
            {topic}
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {itemCount} {itemCount === 1 ? 'note' : 'notes'} in this topic · usually 10–25s
          </p>

          <ol className="mt-4 flex flex-col gap-3">
            {steps.map((step, index) => {
              const complete = done || index < currentStage;
              const current = !done && index === currentStage;
              return (
                <li key={step.label} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      complete
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                        : current
                          ? 'border-amber-400/70 bg-amber-400/10'
                          : 'border-[#2a2a2a] text-zinc-600'
                    }`}
                  >
                    {complete ? (
                      '✓'
                    ) : current ? (
                      <span className="import-progress__dot h-1.5 w-1.5 rounded-full bg-amber-300" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-[13px] leading-tight ${
                        current ? 'text-zinc-100' : complete ? 'text-zinc-400' : 'text-zinc-600'
                      }`}
                    >
                      {step.label}
                    </p>
                    {(current || complete) && (
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                        {step.detail({ topic, count: itemCount })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-sky-400 to-emerald-400 transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
