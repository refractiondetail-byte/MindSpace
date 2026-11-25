import { useMemo } from 'react';

const STEPS = ['Upload', 'Analyze', 'Organize', 'Sync'] as const;

function stepIndexFor(stage: string | null): number {
  if (!stage) return -1;
  if (stage.startsWith('Reading') || stage.startsWith('Uploading')) return 0;
  if (stage.startsWith('Analyzing')) return 1;
  if (stage.startsWith('Matching') || stage.startsWith('Distilling')) return 2;
  if (stage.startsWith('Syncing') || stage.startsWith('Organized')) return 3;
  return 1;
}

export function ImportProgress({ stage }: { stage: string | null }) {
  const activeStep = useMemo(() => stepIndexFor(stage), [stage]);
  if (!stage) return null;

  const finished = stage.startsWith('Organized');

  return (
    <div
      role="status"
      aria-live="polite"
      className="import-progress pointer-events-none fixed bottom-20 left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#09090b] px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
    >
      <div className="import-progress__shimmer absolute inset-x-0 top-0 h-px" />
      <div className="flex items-center gap-2">
        <span className="import-progress__dot h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          AI Organizing
        </span>
      </div>
      <p key={stage} className="import-progress__label mt-1.5 text-sm text-zinc-100">{stage}</p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
        {STEPS.map((step, index) => {
          const complete = finished ? true : index < activeStep;
          const current = !finished && index === activeStep;
          return (
            <div key={step} className="flex items-center gap-1.5">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                  complete
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                    : current
                      ? 'border-amber-400/70 bg-amber-400/10 text-amber-300'
                      : 'border-[#2a2a2a] text-zinc-600'
                }`}
              >
                {complete ? '✓' : index + 1}
              </span>
              <span className={current ? 'text-zinc-200' : complete ? 'text-zinc-400' : 'text-zinc-600'}>
                {step}
              </span>
              {index < STEPS.length - 1 && <span className="text-zinc-700">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}