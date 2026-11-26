import { useEffect, useRef, useState } from 'react';
import { chatWithAI, type ChatTurn } from '../../lib/ai';
import type { SolarStar } from '../../lib/solar';
import type { MindItem } from '../types';

interface AiChatProps {
  stars: SolarStar[];
  activeMoon: MindItem | null;
  onFocusMoon: (moonId: string) => void;
  onOrganize: (plan: {
    starName?: string;
    starColor?: string;
    planets: Array<{ name: string; moonIds: string[] }>;
  }) => Promise<string>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'note';
  content: string;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const SUGGESTIONS = [
  'What is this document about?',
  'Group my files into units',
  'Find my most relevant notes',
];

/**
 * Conversational layer over the solar system. It replaces the old one-shot
 * synthesis/gap buttons: ask a question about the open moon, or tell it how to
 * organize the library. Grounding text is sent explicitly; when a moon has no
 * extracted text the server is told to say so rather than invent it.
 */
export function AiChat({ stars, activeMoon, onFocusMoon, onOrganize }: AiChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: 'assistant',
      content:
        'Ask me about a document or tell me how to organize your stars, planets and moons.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const requestId = ++requestRef.current;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((current) => [...current, { id: makeId(), role: 'user', content: message }]);

    const history: ChatTurn[] = messages
      .filter((entry) => entry.role !== 'note')
      .slice(-8)
      .map((entry) => ({ role: entry.role === 'user' ? 'user' : 'assistant', content: entry.content }));

    const index = stars
      .flatMap((star) =>
        star.planets.flatMap((planet) =>
          planet.moons.map((moon) => ({
            id: moon.id,
            title: moon.title,
            star: star.name,
            planet: planet.name,
            status: moon.extractionStatus ?? ('ok' as const),
          })),
        ),
      )
      .slice(0, 120);

    try {
      const result = await chatWithAI({
        message,
        history,
        moon: activeMoon
          ? {
              title: activeMoon.title,
              text: activeMoon.extractedText,
              status: activeMoon.extractionStatus ?? 'ok',
              note: activeMoon.extractionNote,
            }
          : null,
        index,
      });
      if (requestId !== requestRef.current) return;

      setMessages((current) => [
        ...current,
        { id: makeId(), role: 'assistant', content: result.reply || 'I could not produce an answer.' },
      ]);

      const planets = (result.planets ?? []).filter(
        (planet) => planet.name.trim() && planet.item_ids.length > 0,
      );
      if (planets.length > 0) {
        const status = await onOrganize({
          starName: result.star_name,
          starColor: result.star_color,
          planets: planets.map((planet) => ({
            name: planet.name,
            moonIds: planet.item_ids,
          })),
        });
        if (requestId !== requestRef.current) return;
        setMessages((current) => [...current, { id: makeId(), role: 'note', content: status }]);
      }

      const focusId = result.focus_ids?.find((id) => index.some((entry) => entry.id === id));
      if (focusId) onFocusMoon(focusId);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  }

  const contextLabel = activeMoon
    ? activeMoon.extractionStatus && activeMoon.extractionStatus !== 'ok'
      ? `${activeMoon.title} · no extractable text`
      : activeMoon.title
    : 'Whole solar system';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0d12]/95 px-4 py-2 text-xs font-medium text-slate-200 shadow-xl backdrop-blur hover:border-white/30 hover:text-white"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Ask MindSpace AI
      </button>
    );
  }

  return (
    <section
      className="fixed bottom-4 right-4 z-50 flex max-h-[min(560px,72vh)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#06070a]/96 shadow-2xl backdrop-blur-xl"
      aria-label="MindSpace AI chat"
    >
      <header className="flex items-start justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            MindSpace AI
          </p>
          <p className="truncate text-[10px] text-slate-500">Grounded in: {contextLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
          aria-label="Minimize chat"
        >
          —
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const isNote = message.role === 'note';
          return (
            <div
              key={message.id}
              className={
                isNote
                  ? 'rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-[10px] text-emerald-200'
                  : isUser
                    ? 'ml-8 self-end rounded-2xl rounded-br-sm bg-indigo-500/20 px-3 py-1.5 text-[11px] leading-relaxed text-slate-100'
                    : 'mr-6 self-start rounded-2xl rounded-bl-sm bg-white/[0.06] px-3 py-1.5 text-[11px] leading-relaxed text-slate-200'
              }
            >
              {message.content}
            </div>
          );
        })}
        {busy && (
          <p className="mr-6 flex items-center gap-2 self-start rounded-2xl bg-white/[0.06] px-3 py-1.5 text-[11px] text-slate-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
            Thinking…
          </p>
        )}
        {error && <p className="text-[10px] text-rose-300">{error}</p>}
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={busy}
            onClick={() => void send(suggestion)}
            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-white/25 hover:text-white disabled:opacity-40"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 border-t border-white/10 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={activeMoon ? 'Ask about this document…' : 'Ask or organize…'}
          className="field !rounded-xl !px-2.5 !py-1.5 !text-[11px]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="px-3 pb-2 text-[9px] text-slate-600">
        Document text is sent only when extracted; unavailable text is reported, never invented.
      </p>
    </section>
  );
}
