import {
  targetFromMoon,
  targetFromPlanet,
  targetFromStar,
  type SolarPlanet,
  type SolarStar,
} from '../../lib/solar';
import { isGoogleSlidesUrl } from '../../lib/slides';
import { formatBytes, formatDate } from '../format';
import type { ItemContextHandlers } from '../hooks/useItemContextMenu';
import type { MindItem } from '../types';
import { ChevronRightIcon, StarGlyph } from './SolarGlyphs';
import { PlanetPreview } from './PlanetPreview';

export interface FileSystemPath {
  star: string | null;
  planet: string | null;
}

interface FileSystemViewProps {
  stars: SolarStar[];
  path: FileSystemPath;
  onNavigate: (path: FileSystemPath) => void;
  onOpenMoon: (moon: MindItem) => void;
  bindItem: (target: ReturnType<typeof targetFromStar>) => ItemContextHandlers;
}

const FILE_TONES: Record<string, string> = {
  pdf: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  docx: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  doc: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  pptx: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  ppt: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  md: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  txt: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  png: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  jpg: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  jpeg: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  webp: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
};
const FALLBACK_TONE = 'border-zinc-700/40 bg-white/[0.03] text-zinc-300';

function extensionOf(moon: MindItem): string {
  const name = (moon.attachments[0]?.name ?? moon.title).toLowerCase();
  return name.includes('.') ? name.split('.').pop() ?? '' : '';
}

function fileBadge(moon: MindItem): { label: string; tone: string } {
  if (isGoogleSlidesUrl(moon.sourceUrl)) {
    return { label: 'SLID', tone: FILE_TONES.pptx };
  }
  const ext = extensionOf(moon);
  if (!ext) return { label: 'NOTE', tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' };
  return {
    label: ext.slice(0, 4).toUpperCase(),
    tone: FILE_TONES[ext] ?? FALLBACK_TONE,
  };
}

function extractionTone(moon: MindItem): { dot: string; label: string } {
  const status = moon.extractionStatus ?? 'ok';
  if (status === 'ok') return { dot: 'bg-emerald-400', label: 'text read' };
  if (status === 'empty') return { dot: 'bg-amber-400', label: 'no text layer' };
  if (status === 'unsupported') return { dot: 'bg-pink-400', label: 'unsupported' };
  return { dot: 'bg-rose-400', label: 'extraction failed' };
}

function latestDate(star: SolarStar): string | null {
  let latest = '';
  for (const planet of star.planets) {
    for (const moon of planet.moons) {
      if (moon.createdAt > latest) latest = moon.createdAt;
    }
  }
  return latest || null;
}

function StarCard({
  star,
  onOpen,
  bindItem,
}: {
  star: SolarStar;
  onOpen: () => void;
  bindItem: FileSystemViewProps['bindItem'];
}) {
  const updated = latestDate(star);
  return (
    <article
      {...bindItem(targetFromStar(star))}
      className="fs-enter item-touch group rounded-xl border border-[#1A1A1A] bg-[#030303] transition-colors duration-150 hover:border-zinc-600/70 hover:bg-[#080808]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
      >
        <StarGlyph color={star.color} size={34} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100">{star.name}</span>
            <span className="shrink-0 rounded border border-[#242424] px-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Star
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
            <span>
              {star.planets.length} planet{star.planets.length === 1 ? '' : 's'}
            </span>
            <span className="text-zinc-700">·</span>
            <span>
              {star.moonCount} moon{star.moonCount === 1 ? '' : 's'}
            </span>
            {updated && (
              <>
                <span className="text-zinc-700">·</span>
                <span>updated {formatDate(updated)}</span>
              </>
            )}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
      </button>
    </article>
  );
}

function PlanetCard({
  planet,
  onOpen,
  bindItem,
}: {
  planet: SolarPlanet;
  onOpen: () => void;
  bindItem: FileSystemViewProps['bindItem'];
}) {
  const kinds = [...new Set(planet.moons.map((moon) => fileBadge(moon).label))].slice(0, 3);
  const latest = planet.moons[0]?.createdAt;
  return (
    <article
      {...bindItem(targetFromPlanet(planet))}
      className="fs-enter item-touch group rounded-xl border border-[#1A1A1A] bg-[#030303] transition-colors duration-150 hover:border-zinc-600/70 hover:bg-[#080808]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl p-3 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
      >
        <PlanetPreview seed={planet.key} color={planet.color} moons={planet.moons.length} size={34} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-zinc-100">{planet.name}</span>
            <span className="shrink-0 rounded border border-[#242424] px-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Planet
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
            <span>
              {planet.moons.length} moon{planet.moons.length === 1 ? '' : 's'}
            </span>
            {latest && (
              <>
                <span className="text-zinc-700">·</span>
                <span>{formatDate(latest)}</span>
              </>
            )}
            {kinds.map((kind) => (
              <span
                key={kind}
                className="rounded border border-[#242424] px-1 text-[8px] uppercase tracking-wide text-zinc-500"
              >
                {kind}
              </span>
            ))}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-300" />
      </button>
    </article>
  );
}

function MoonRow({
  moon,
  onOpen,
  bindItem,
}: {
  moon: MindItem;
  onOpen: () => void;
  bindItem: FileSystemViewProps['bindItem'];
}) {
  const badge = fileBadge(moon);
  const extraction = extractionTone(moon);
  const attachment = moon.attachments[0] ?? null;
  const slides = extensionOf(moon) === 'pptx' || isGoogleSlidesUrl(moon.sourceUrl);

  return (
    <li {...bindItem(targetFromMoon(moon))} className="item-touch">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors duration-150 hover:border-[#1A1A1A] hover:bg-white/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border text-[8px] font-semibold tracking-wide ${badge.tone}`}
        >
          {badge.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-zinc-100">{moon.title}</span>
            {slides && (
              <span className="shrink-0 rounded border border-amber-500/25 px-1 text-[8px] uppercase tracking-wide text-amber-300">
                slides
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
            <span className="inline-flex items-center gap-1" title={extraction.label}>
              <span className={`h-1.5 w-1.5 rounded-full ${extraction.dot}`} />
              {extraction.label}
            </span>
            {attachment && (
              <>
                <span className="text-zinc-700">·</span>
                <span>{formatBytes(attachment.size)}</span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <span>{formatDate(moon.createdAt)}</span>
            {moon.textChars ? (
              <>
                <span className="text-zinc-700">·</span>
                <span>{moon.textChars.toLocaleString()} chars</span>
              </>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600 transition group-hover:text-zinc-300">
          Open →
        </span>
      </button>
    </li>
  );
}

const eyebrow = 'text-[9px] font-semibold uppercase tracking-[0.24em] text-zinc-600';

/**
 * Structured mirror of the galaxy: Stars → Planets → Moons, with one-click
 * drill-down. It renders the same live nodes the 3D world does, so moves,
 * creations and deletions appear in both views immediately.
 */
export function FileSystemView({
  stars,
  path,
  onNavigate,
  onOpenMoon,
  bindItem,
}: FileSystemViewProps) {
  const star = path.star ? stars.find((entry) => entry.name === path.star) ?? null : null;
  const planet =
    star && path.planet
      ? star.planets.find((entry) => entry.name === path.planet) ?? null
      : null;
  const totalMoons = stars.reduce((total, entry) => total + entry.moonCount, 0);

  function goBack() {
    if (planet && star) {
      onNavigate({ star: star.name, planet: null });
    } else if (star) {
      onNavigate({ star: null, planet: null });
    }
  }

  return (
    <section
      className="absolute inset-0 z-10 overflow-y-auto bg-[#000000] text-zinc-100"
      aria-label="Celestial file system"
    >
      <div className="mx-auto w-full max-w-5xl px-3 pb-32 pt-28 sm:px-5 sm:pt-20">
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[#141414] pb-3">
          <button
            type="button"
            onClick={goBack}
            disabled={!star}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#1A1A1A] px-2 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Back
          </button>

          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px]"
          >
            <button
              type="button"
              onClick={() => onNavigate({ star: null, planet: null })}
              aria-current={!star ? 'page' : undefined}
              className={`shrink-0 rounded px-1 py-0.5 transition hover:text-white ${
                !star ? 'text-zinc-100' : 'text-zinc-500'
              }`}
            >
              Galaxy Root
            </button>
            {star && (
              <>
                <span className="text-zinc-700">/</span>
                <button
                  type="button"
                  onClick={() => onNavigate({ star: star.name, planet: null })}
                  aria-current={!planet ? 'page' : undefined}
                  className={`min-w-0 truncate rounded px-1 py-0.5 transition hover:text-white ${
                    !planet ? 'text-zinc-100' : 'text-zinc-500'
                  }`}
                >
                  {star.name}
                </button>
              </>
            )}
            {planet && (
              <>
                <span className="text-zinc-700">/</span>
                <span aria-current="page" className="min-w-0 truncate text-zinc-100">
                  {planet.name}
                </span>
              </>
            )}
          </nav>

          <span className="hidden shrink-0 text-[10px] text-zinc-600 sm:inline">
            {!star
              ? `${stars.length} stars · ${totalMoons} moons`
              : !planet
                ? `${star.planets.length} planets · ${star.moonCount} moons`
                : `${planet.moons.length} moons`}
          </span>
        </div>

        {!star && (
          <div className="fs-enter">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className={eyebrow}>Celestial file system</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">
                  Galaxy Root
                </h1>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Stars are folders. Open one to see its planets, then their moons.
                </p>
              </div>
              <p className="text-[10px] text-zinc-600">Right-click or long-press any item for actions</p>
            </header>

            {stars.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#242424] bg-[#030303] p-8 text-center">
                <p className="text-sm text-zinc-300">No stars yet.</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Import documents or capture a note to form your first star.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stars.map((entry) => (
                  <StarCard
                    key={entry.name}
                    star={entry}
                    bindItem={bindItem}
                    onOpen={() => onNavigate({ star: entry.name, planet: null })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {star && !planet && (
          <div className="fs-enter">
            <header className="mb-4 flex items-center gap-3">
              <StarGlyph color={star.color} size={38} />
              <div className="min-w-0">
                <p className={eyebrow}>Star · topic</p>
                <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50">
                  {star.name}
                </h1>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {star.planets.length} planet{star.planets.length === 1 ? '' : 's'} ·{' '}
                  {star.moonCount} moon{star.moonCount === 1 ? '' : 's'}
                </p>
              </div>
            </header>

            {star.planets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#242424] bg-[#030303] p-8 text-center">
                <p className="text-sm text-zinc-300">This star has no planets yet.</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Import a document and let the AI build its units.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {star.planets.map((entry) => (
                  <PlanetCard
                    key={entry.key}
                    planet={entry}
                    bindItem={bindItem}
                    onOpen={() => onNavigate({ star: star.name, planet: entry.name })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {star && planet && (
          <div className="fs-enter">
            <header className="mb-4 flex items-center gap-3">
              <PlanetPreview
                seed={planet.key}
                color={planet.color}
                moons={planet.moons.length}
                size={44}
              />
              <div className="min-w-0">
                <p className={eyebrow}>Planet · unit</p>
                <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50">
                  {planet.name}
                </h1>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {star.name} · {planet.moons.length} moon
                  {planet.moons.length === 1 ? '' : 's'}
                  {planet.summary ? ` · ${planet.summary}` : ''}
                </p>
              </div>
            </header>

            {planet.moons.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#242424] bg-[#030303] p-8 text-center">
                <p className="text-sm text-zinc-300">This planet has no moons yet.</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Import a file or drag one onto the workspace to add it.
                </p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-[#1A1A1A] bg-[#020202]">
                {planet.moons.map((moon) => (
                  <MoonRow
                    key={moon.id}
                    moon={moon}
                    bindItem={bindItem}
                    onOpen={() => onOpenMoon(moon)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
