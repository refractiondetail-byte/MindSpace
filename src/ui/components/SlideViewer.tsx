import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  googleSlidesEmbedUrl,
  googleSlidesOpenUrl,
  isGoogleSlidesUrl,
  parsePptxDeck,
  type SlideDeck,
  type SlideShape,
} from '../../lib/slides';
import { EMU_PER_INCH } from '../../lib/slides';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const MIN_SLIDE_WIDTH = 320;
const MAX_SLIDE_WIDTH = 920;

const controlClass =
  'rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-35';

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
}

/* ------------------------------------------------------------ one slide */

function SlideShapeView({
  shape,
  slideWidth,
  deckWidth,
}: {
  shape: SlideShape;
  slideWidth: number;
  deckWidth: number;
}) {
  const scale = deckWidth > 0 ? slideWidth / deckWidth : 1;
  const pxPerInch = scale * EMU_PER_INCH;
  const style: CSSProperties = {
    position: 'absolute',
    left: shape.x * scale,
    top: shape.y * scale,
    width: shape.w * scale,
    height: shape.h * scale,
    overflow: 'hidden',
  };

  if (shape.kind === 'image') {
    if (!shape.src) {
      return (
        <div
          style={{
            ...style,
            border: '1px dashed rgba(15,23,42,0.2)',
            borderRadius: 2,
          }}
          aria-hidden="true"
        />
      );
    }
    return (
      <img
        src={shape.src}
        alt=""
        draggable={false}
        style={{ ...style, objectFit: 'fill' }}
      />
    );
  }

  if (shape.fill) style.background = shape.fill;
  if (shape.kind === 'rect') return <div style={style} />;

  const defaultSizePt = shape.defaultSizePt ?? 16;
  const anchor = shape.anchor ?? 't';
  const paragraphs = shape.paragraphs ?? [];

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start',
        padding: `${0.05 * pxPerInch}px ${0.1 * pxPerInch}px`,
      }}
    >
      {paragraphs.map((paragraph, paragraphIndex) => {
        const align =
          paragraph.align === 'ctr'
            ? 'center'
            : paragraph.align === 'r'
              ? 'right'
              : paragraph.align === 'just'
                ? 'justify'
                : 'left';
        return (
          <p
            key={paragraphIndex}
            style={{
              margin: 0,
              textAlign: align,
              paddingLeft: (paragraph.level ?? 0) * 0.24 * pxPerInch,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.16,
              wordBreak: 'break-word',
            }}
          >
            {paragraph.runs.map((run, runIndex) => (
              <span
                key={runIndex}
                style={{
                  fontSize: ((run.sizePt ?? defaultSizePt) / 72) * pxPerInch,
                  fontWeight: run.bold ? 700 : 400,
                  fontStyle: run.italic ? 'italic' : 'normal',
                  color: run.color ?? shape.defaultColor ?? '#111827',
                }}
              >
                {run.text}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- deck + controls */

/**
 * Slide-by-slide viewer: one slide is drawn at a time from the parsed deck so
 * large presentations stay light, with Prev/Next, a counter and zoom. Arrow
 * keys / +- / 0 work once the slide area has focus.
 */
function SlideDeckViewer({ deck }: { deck: SlideDeck }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showText, setShowText] = useState(false);
  const [measured, setMeasured] = useState(640);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const measure = () => {
      const available = element.clientWidth - 4;
      setMeasured(
        Math.max(MIN_SLIDE_WIDTH, Math.min(MAX_SLIDE_WIDTH, available || MIN_SLIDE_WIDTH)),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    hostRef.current?.focus({ preventScroll: true });
  }, []);

  const total = deck.slides.length;
  const current = deck.slides[Math.min(index, total - 1)];
  const slideWidth = measured;
  const slideHeight = (slideWidth * deck.height) / deck.width;

  const goTo = (next: number) => setIndex(Math.max(0, Math.min(total - 1, next)));

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom((value) => clampZoom(value + ZOOM_STEP));
    } else if (event.key === '-') {
      event.preventDefault();
      setZoom((value) => clampZoom(value - ZOOM_STEP));
    } else if (event.key === '0') {
      event.preventDefault();
      setZoom(1);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#08090d]/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={controlClass}
            onClick={() => goTo(index - 1)}
            disabled={index <= 0}
            title="Previous slide (←)"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => goTo(index + 1)}
            disabled={index >= total - 1}
            title="Next slide (→)"
          >
            Next ›
          </button>
        </div>

        <span className="text-[11px] font-medium text-slate-300">
          Slide {index + 1} / {total}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={controlClass}
            onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out (−)"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className={`${controlClass} min-w-[46px] tabular-nums`}
            onClick={() => setZoom(1)}
            title="Reset zoom (0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => setShowText((value) => !value)}
            aria-pressed={showText}
            title="Show this slide's text and speaker notes"
          >
            {showText ? 'Hide text' : 'Text'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2">
        <div
          ref={hostRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="scroll-thin overflow-auto rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-white/25"
          aria-label={`Slide ${index + 1} of ${total}`}
        >
          <div
            style={{
              width: slideWidth * zoom,
              height: slideHeight * zoom,
              margin: '0 auto',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: slideWidth,
                height: slideHeight,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                backgroundColor: current?.background ?? '#ffffff',
                borderRadius: 6,
                overflow: 'hidden',
                boxShadow: '0 18px 44px -22px rgba(0,0,0,0.95)',
              }}
            >
              {(current?.shapes ?? []).map((shape, shapeIndex) => (
                <SlideShapeView
                  key={shapeIndex}
                  shape={shape}
                  slideWidth={slideWidth}
                  deckWidth={deck.width}
                />
              ))}
              {!current?.shapes.length && (
                <div className="flex h-full w-full items-center justify-center">
                  <p className="text-[12px] text-slate-500">
                    This slide has no text or images that can be drawn.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {showText && (
          <div className="scroll-thin max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2.5 text-[11px] text-slate-300">
            <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Slide {index + 1} text
            </p>
            {current?.text ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-200">
                {current.text}
              </pre>
            ) : (
              <p className="text-slate-500">No text on this slide.</p>
            )}
            {current?.notes ? (
              <>
                <p className="mb-1 mt-2 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Speaker notes
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-200">
                  {current.notes}
                </pre>
              </>
            ) : null}
          </div>
        )}

        <p className="text-[10px] text-slate-500">
          ← → change slide · + − zoom. Layouts are redrawn locally from the slide file; exotic
          effects, animations and embedded media may look simplified.
          {deck.omittedImages > 0
            ? ` ${deck.omittedImages} large picture${
                deck.omittedImages === 1 ? '' : 's'
              } were skipped to keep the deck light.`
            : ''}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- PPTX host */

/** Parse and show the .pptx stored with a moon. */
export function PptxSlides({ blob, fallbackText }: { blob: Blob; fallbackText?: string }) {
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDeck(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const parsed = await parsePptxDeck(await blob.arrayBuffer());
        if (!cancelled) setDeck(parsed);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-[11px] text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
        Laying out slides…
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          These slides could not be drawn: {error ?? 'unknown error'}. The extracted slide text is
          still stored with this moon and available to the assistant.
        </p>
        {fallbackText ? (
          <pre className="scroll-thin max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
            {fallbackText}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!deck.slides.length) {
    return (
      <div className="p-4">
        <p className="rounded-lg border border-dashed border-white/10 p-3 text-[11px] text-amber-300">
          This presentation contains no slides that can be read.
        </p>
      </div>
    );
  }

  return <SlideDeckViewer deck={deck} />;
}

/* ------------------------------------------------------- Google Slides */

/**
 * Embedded Google Slides. The deck only embeds when it is shared with "Anyone
 * with the link"; when the frame stays empty the viewer says why instead of
 * silently showing a blank panel.
 */
export function GoogleSlidesView({
  url,
  extractedText,
}: {
  url: string;
  extractedText?: string;
}) {
  const embedUrl = isGoogleSlidesUrl(url) ? googleSlidesEmbedUrl(url) : null;
  const openUrl = googleSlidesOpenUrl(url);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!embedUrl) return;
    setLoaded(false);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(timer);
  }, [embedUrl, reloadKey]);

  const hasStoredText = Boolean(extractedText?.trim());

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
        <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-300">
          Google Slides
        </span>
        <span className="text-[10px] text-slate-500">
          {!embedUrl ? 'Link not recognised' : loaded ? 'Embed loaded' : 'Loading embed…'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={controlClass}
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={!embedUrl}
            title="Reload the embedded deck"
          >
            Reload
          </button>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={controlClass}
            >
              Open in Slides ↗
            </a>
          )}
        </div>
      </div>

      {embedUrl ? (
        <div className="bg-black/50 p-2">
          <iframe
            key={reloadKey}
            src={embedUrl}
            title="Google Slides presentation"
            onLoad={() => setLoaded(true)}
            allow="fullscreen"
            referrerPolicy="no-referrer"
            className="w-full rounded-md border border-white/10 bg-black"
            style={{ height: 'max(380px, 58vh)' }}
          />
        </div>
      ) : (
        <div className="m-3 rounded-lg border border-dashed border-white/10 p-3 text-[11px] text-amber-300">
          This link is not a Google Slides presentation URL, so it cannot be embedded. Expected a
          link like https://docs.google.com/presentation/d/…/edit.
        </div>
      )}

      {(slow && !loaded) || helpOpen ? (
        <div className="mx-2 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          <p className="font-semibold">
            {slow && !loaded
              ? 'Google has not rendered the deck yet.'
              : 'Why an embedded deck can stay blank'}
          </p>
          <p className="mt-1">
            Google only allows slides to be embedded when the presentation is shared publicly.
            Open the deck in Google Slides → <span className="font-semibold">Share</span> →{' '}
            <span className="font-semibold">General access</span> →{' '}
            <span className="font-semibold">Anyone with the link (Viewer)</span>, then press
            Reload. A deck that requires sign-in, lives in a restricted Workspace drive, or was
            never published cannot be framed here at all — use “Open in Slides” instead.
          </p>
          <p className="mt-1">
            Embedding also cannot read the slides for the AI: a link-only moon stores no slide
            text. Export the deck as .pptx and import it to keep the slide text and speaker notes
            with this moon.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[10px] text-slate-500">
        <button type="button" className={controlClass} onClick={() => setHelpOpen((v) => !v)}>
          {helpOpen ? 'Hide troubleshooting' : 'Deck not showing?'}
        </button>
        <span className="min-w-0 flex-1">
          {hasStoredText
            ? 'Slide text and notes from the imported .pptx are stored with this moon; the assistant answers from them.'
            : 'No slide text is stored for this link, so the assistant can only see its title.'}
        </span>
      </div>
    </div>
  );
}
