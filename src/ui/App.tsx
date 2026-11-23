import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listThoughts } from '../core/repository';
import { filterThoughts } from '../core/search';
import type { Region } from '../core/types';
import { AddNodeForm } from './components/AddNodeForm';
import { NodeList } from './components/NodeList';
import { RegionFilter } from './components/RegionFilter';

export default function App() {
  const thoughts = useLiveQuery(() => listThoughts(), []);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region | 'all'>('all');

  const visible = useMemo(
    () =>
      filterThoughts(thoughts ?? [], {
        query,
        regions: region === 'all' ? [] : [region],
      }),
    [thoughts, query, region],
  );

  const counts = useMemo(() => {
    const base: Record<Region, number> = { prefrontal: 0, hippocampus: 0, limbic: 0, parietal: 0 };
    for (const thought of thoughts ?? []) base[thought.region] += 1;
    return base;
  }, [thoughts]);

  const total = thoughts?.length ?? 0;
  const loading = thoughts === undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-indigo-300/80">MindSpace · Milestone 1</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Your second brain, stored locally</h1>
          <p className="mt-1 text-sm text-slate-400">
            Dexie (IndexedDB) · {loading ? 'loading…' : `${total} ${total === 1 ? 'node' : 'nodes'}`} · nothing
            leaves this device
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-400">
          Showing <span className="text-slate-200">{visible.length}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="lg:sticky lg:top-6 lg:self-start">
          <AddNodeForm />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="glass-panel flex flex-col gap-3 p-4">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                🔍
              </span>
              <label className="block">
                <span className="sr-only">Search nodes</span>
                <input
                  className="field pl-9"
                  type="search"
                  placeholder="Search titles, content, tags…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <RegionFilter value={region} onChange={setRegion} counts={counts} total={total} />
          </div>

          <NodeList thoughts={visible} isLoading={loading} hasNodes={total > 0} />
        </section>
      </div>
    </main>
  );
}
