import { useEffect, useState, type FormEvent } from 'react';
import {
  targetKindLabel,
  type SolarPlanet,
  type SolarStar,
  type SolarTarget,
} from '../../lib/solar';
import { moveExplanation } from '../targets';
import { PlanetPreview } from './PlanetPreview';
import { StarGlyph, TrashIcon } from './SolarGlyphs';

function useEscape(onClose: () => void, busy: boolean) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);
}

function DialogFrame({
  label,
  children,
  onClose,
  busy,
}: {
  label: string;
  children: React.ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center"
      role="presentation"
      onPointerDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fs-enter flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#1A1A1A] bg-[#050505] shadow-[0_40px_110px_-35px_rgba(0,0,0,1)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const eyebrow = 'text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-600';
const secondaryButton =
  'rounded-lg border border-[#1A1A1A] px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-40';
const primaryButton =
  'rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30';

/* ------------------------------------------------------------ move manually */

export function MoveItemDialog({
  target,
  stars,
  onClose,
  onSubmit,
}: {
  target: SolarTarget;
  stars: SolarStar[];
  onClose: () => void;
  onSubmit: (destination: { star: SolarStar; planet: SolarPlanet }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<{ star: SolarStar; planet: SolarPlanet } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose, busy);

  function isCurrent(star: SolarStar, planet: SolarPlanet): boolean {
    if (target.kind === 'star') return false;
    return star.name === target.star && planet.name === target.planet;
  }

  async function submit() {
    if (!selected || busy || isCurrent(selected.star, selected.planet)) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(selected);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame label={`Move ${target.title}`} onClose={onClose} busy={busy}>
      <header className="flex items-start gap-2 border-b border-[#1A1A1A] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={eyebrow}>Move manually</p>
          <h2 className="mt-0.5 truncate text-sm font-semibold text-zinc-50">
            Move “{target.title}”
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">{moveExplanation(target)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close move dialog"
          className="rounded-md border border-[#1A1A1A] px-2 py-0.5 text-[10px] text-zinc-400 transition hover:text-white disabled:opacity-40"
        >
          ✕
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {stars.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] text-zinc-500">
            There are no stars to move into yet.
          </p>
        ) : (
          stars.map((star) => (
            <section key={star.name}>
              <div className="flex items-center gap-2 px-1 pb-1 pt-3">
                <StarGlyph color={star.color} size={16} />
                <span className="min-w-0 truncate text-[11px] font-semibold text-zinc-200">
                  {star.name}
                </span>
                <span className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                  {star.planets.length} planet{star.planets.length === 1 ? '' : 's'}
                </span>
              </div>
              {star.planets.length === 0 ? (
                <p className="px-1 pb-1 text-[10px] text-zinc-600">No planets in this star yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {star.planets.map((planet) => {
                    const current = isCurrent(star, planet);
                    const chosen =
                      selected?.star.name === star.name && selected.planet.name === planet.name;
                    return (
                      <button
                        key={planet.key}
                        type="button"
                        disabled={current || busy}
                        onClick={() => setSelected({ star, planet })}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                          chosen
                            ? 'border-zinc-400/60 bg-white/[0.07]'
                            : 'border-[#1A1A1A] hover:border-zinc-600 hover:bg-white/[0.03]'
                        } ${current ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <PlanetPreview
                          seed={planet.key}
                          color={planet.color}
                          moons={planet.moons.length}
                          size={26}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] text-zinc-200">
                            {planet.name}
                          </span>
                          <span className="block text-[9px] text-zinc-500">
                            {planet.moons.length} moon{planet.moons.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        {current ? (
                          <span className="shrink-0 text-[8px] uppercase tracking-[0.12em] text-zinc-500">
                            current
                          </span>
                        ) : chosen ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200">
          {error}
        </p>
      )}

      <footer className="flex items-center justify-end gap-2 border-t border-[#1A1A1A] px-4 py-2.5">
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!selected || busy || isCurrent(selected.star, selected.planet)}
          className={primaryButton}
        >
          {busy ? 'Moving…' : 'Move here'}
        </button>
      </footer>
    </DialogFrame>
  );
}

/* --------------------------------------------------------- ask AI to organize */

const AI_PLACEHOLDER = 'Where should the AI move this or how should it organize it?';
const AI_SUGGESTIONS = [
  'Move this into the best matching planet.',
  'Create a new planet for this under its current star.',
  'Group this with related moons and rename the unit.',
];

export function AiMoveDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: SolarTarget;
  onClose: () => void;
  onSubmit: (instruction: string) => Promise<string>;
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState('');
  useEscape(onClose, busy);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult('');
    try {
      setResult(await onSubmit(text));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const count = target.items.length;

  return (
    <DialogFrame label={`Ask AI to move ${target.title}`} onClose={onClose} busy={busy}>
      <header className="flex items-start gap-2 border-b border-[#1A1A1A] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={eyebrow}>Ask AI to move / organize</p>
          <h2 className="mt-0.5 truncate text-sm font-semibold text-zinc-50">
            {targetKindLabel(target.kind)} · {target.title}
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">
            {count} moon{count === 1 ? '' : 's'} · {target.star}
            {target.planet ? ` › ${target.planet}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close AI move dialog"
          className="rounded-md border border-[#1A1A1A] px-2 py-0.5 text-[10px] text-zinc-400 transition hover:text-white disabled:opacity-40"
        >
          ✕
        </button>
      </header>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label htmlFor="ai-move-instruction" className="sr-only">
            Instruction for the AI organizer
          </label>
          <textarea
            id="ai-move-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={AI_PLACEHOLDER}
            rows={3}
            autoFocus
            className="field resize-none !rounded-lg !text-[12px]"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {AI_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => setInstruction(suggestion)}
                className="rounded-full border border-[#1A1A1A] px-2 py-0.5 text-[9px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {busy && (
            <p className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />
              Sending the item and instruction to the organizer…
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200">
              {error}
            </p>
          )}
          {result && (
            <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                Organizer
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-emerald-100/90">
                {result}
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#1A1A1A] px-4 py-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            Close
          </button>
          <button type="submit" disabled={!instruction.trim() || busy} className={primaryButton}>
            {busy ? 'Organizing…' : 'Ask AI'}
          </button>
        </footer>
      </form>
    </DialogFrame>
  );
}

/* -------------------------------------------------------------------- delete */

export function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: SolarTarget;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose, busy);

  const count = target.items.length;
  const detail =
    target.kind === 'star'
      ? `This permanently removes the star, all of its planets and ${count} moon${
          count === 1 ? '' : 's'
        } from both views and the synced database.`
      : `This permanently removes the planet and its ${count} moon${
          count === 1 ? '' : 's'
        } from both views and the synced database.`;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame label={`Delete ${target.title}`} onClose={onClose} busy={busy}>
      <div className="px-4 pb-1 pt-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <TrashIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className={eyebrow}>Confirm delete</p>
            <h2 className="mt-0.5 text-sm font-semibold text-zinc-50">
              Delete {targetKindLabel(target.kind).toLowerCase()} “{target.title}”?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{detail}</p>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200">
            {error}
          </p>
        )}
      </div>
      <footer className="mt-3 flex items-center justify-end gap-2 border-t border-[#1A1A1A] px-4 py-2.5">
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:border-rose-400/60 hover:bg-rose-500/25 disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </footer>
    </DialogFrame>
  );
}
