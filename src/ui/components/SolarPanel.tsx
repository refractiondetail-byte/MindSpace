import type { SolarPlanet, SolarStar } from '../../lib/solar';
import type { MindItem } from '../types';
import { FloatingWindow } from './FloatingWindow';
import { PlanetPreview } from './PlanetPreview';

interface SolarPanelProps {
  star: SolarStar;
  expandedPlanet: string | null;
  onTogglePlanet: (planet: SolarPlanet) => void;
  onOpenMoon: (moon: MindItem) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'PPTX',
  text: 'TXT',
  image: 'IMG',
  other: 'FILE',
};

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function moonBadge(moon: MindItem): string {
  const name = moon.attachments[0]?.name ?? moon.title;
  const ext = extensionOf(name);
  if (KIND_LABEL[ext]) return KIND_LABEL[ext];
  if (ext === 'md') return 'MD';
  if (ext) return ext.slice(0, 4).toUpperCase();
  return 'DOC';
}

function extractionDot(moon: MindItem): { color: string; label: string } {
  const status = moon.extractionStatus ?? 'ok';
  if (status === 'ok') return { color: '#34d399', label: 'text extracted' };
  if (status === 'empty') return { color: '#fbbf24', label: 'no text layer' };
  if (status === 'unsupported') return { color: '#f472b6', label: 'unsupported type' };
  return { color: '#fb7185', label: 'extraction failed' };
}

/**
 * Topic (Star) search panel: one box per Planet (Unit) with a spinning planet
 * preview. Expanding a box reveals its Moons (documents) to open.
 */
export function SolarPanel({
  star,
  expandedPlanet,
  onTogglePlanet,
  onOpenMoon,
  onClose,
}: SolarPanelProps) {
  return (
    <FloatingWindow
      title={`★ ${star.name}`}
      subtitle={`${star.planets.length} planet${star.planets.length === 1 ? '' : 's'} · ${star.moonCount} moon${star.moonCount === 1 ? '' : 's'}`}
      accent={star.color}
      onClose={onClose}
      initial={{ width: Math.min(560, Math.round(window.innerWidth * 0.48)), height: Math.min(640, Math.round(window.innerHeight * 0.76)) }}
      bodyClassName="p-3"
    >
      {star.planets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
          This star has no planets yet. Import documents to let the AI build its units.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {star.planets.map((planet) => {
            const expanded = expandedPlanet === planet.name;
            return (
              <div
                key={planet.key}
                className={`rounded-xl border transition ${
                  expanded ? 'border-white/25 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                } ${expanded ? 'sm:col-span-2' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onTogglePlanet(planet)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-2.5 text-left"
                >
                  <PlanetPreview
                    seed={planet.key}
                    color={planet.color}
                    moons={planet.moons.length}
                    size={48}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-100">
                      {planet.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                      {planet.moons.length} moon{planet.moons.length === 1 ? '' : 's'}
                      {planet.summary ? ` · ${planet.summary}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {expanded ? '▾' : '▸'}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-white/10 p-2">
                    {planet.moons.length === 0 ? (
                      <p className="px-1 py-2 text-[11px] text-slate-500">
                        No moons yet — import a file for this unit.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {planet.moons.map((moon) => {
                          const dot = extractionDot(moon);
                          return (
                            <li key={moon.id}>
                              <button
                                type="button"
                                onClick={() => onOpenMoon(moon)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
                              >
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: dot.color }}
                                  title={dot.label}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[11px] font-medium text-slate-100">
                                    {moon.title}
                                  </span>
                                  <span className="block truncate text-[10px] text-slate-500">
                                    {moonBadge(moon)}
                                    {moon.textChars ? ` · ${moon.textChars.toLocaleString()} chars read` : ` · ${dot.label}`}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[10px] text-slate-500">open →</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FloatingWindow>
  );
}
