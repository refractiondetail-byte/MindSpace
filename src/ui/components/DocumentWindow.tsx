import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getAttachmentBlob } from '../../core/repository';
import { detectKind } from '../../lib/extractText';
import { isGoogleSlidesUrl, isLegacyPresentation } from '../../lib/slides';
import type { SolarPlanet, SolarStar } from '../../lib/solar';
import type { MindItem } from '../types';
import { formatBytes } from '../format';
import { FloatingWindow } from './FloatingWindow';
import { GoogleSlidesView, PptxSlides } from './SlideViewer';
import { TrashIcon } from './SolarGlyphs';

interface DocumentWindowProps {
  moon: MindItem;
  star: SolarStar | null;
  planet: SolarPlanet | null;
  onDelete: () => void;
  /** Step back up to the planet menu. */
  onBack?: () => void;
  onClose: () => void;
}

function extractionLabel(moon: MindItem): { text: string; tone: string } {
  const status = moon.extractionStatus ?? 'ok';
  if (status === 'ok') return { text: 'Text read', tone: 'text-emerald-300' };
  if (status === 'empty') return { text: 'No text layer', tone: 'text-amber-300' };
  if (status === 'unsupported') return { text: 'Unsupported format', tone: 'text-pink-300' };
  return { text: 'Extraction failed', tone: 'text-rose-300' };
}

/** Render a PDF from IndexedDB to canvases, page by page. */
function PdfPages({ blob }: { blob: Blob }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const data = new Uint8Array(await blob.arrayBuffer());
        const loadingTask = pdfjs.getDocument({ data });
        const doc = await loadingTask.promise;
        const hostWidth = hostRef.current?.clientWidth ?? 540;
        const limit = Math.min(doc.numPages, 40);
        const rendered: string[] = [];

        for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
          if (cancelled) {
            void loadingTask.destroy();
            return;
          }
          // eslint-disable-next-line no-await-in-loop
          const page = await doc.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const fit = Math.min(2.4, Math.max(0.7, (hostWidth - 24) / base.width));
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale: fit * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          // eslint-disable-next-line no-await-in-loop
          await page.render({ canvas, viewport }).promise;
          rendered.push(canvas.toDataURL('image/jpeg', 0.86));
          page.cleanup();
          if (!cancelled) setPages([...rendered]);
        }

        void loadingTask.destroy();
        if (!cancelled) setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <div ref={hostRef} className="flex flex-col gap-3 p-3">
      {loading && pages.length === 0 && (
        <p className="text-[11px] text-slate-500">Rendering PDF pages…</p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          Could not render this PDF: {error}. You can still download it below.
        </p>
      )}
      {pages.map((src, index) => (
        <figure key={index} className="overflow-hidden rounded-lg border border-white/10 bg-black">
          <img src={src} alt={`Page ${index + 1}`} className="block w-full" />
          <figcaption className="border-t border-white/5 px-2 py-1 text-[10px] text-slate-500">
            Page {index + 1}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Old binary .ppt/.pps decks: explain instead of pretending to render. */
function LegacyPresentationNotice({ name }: { name: string }) {
  return (
    <div className="p-4">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
        <p className="text-[11px] font-semibold text-amber-200">
          PowerPoint 97–2003 (.ppt) cannot be drawn in the browser
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
          {name} is the old binary format. Open it in PowerPoint or Google Slides and save it as a
          .pptx (or PDF), then import it again — the new moon gets the same visual slide viewer and
          its slide text stays available to the assistant.
        </p>
      </div>
    </div>
  );
}

/** A captured link that is not a Slides deck: offer it as an outbound link. */
function LinkCard({ url }: { url: string }) {
  return (
    <div className="p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Captured link</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 block break-all text-[12px] text-sky-300 hover:text-sky-200"
        >
          {url}
        </a>
        <p className="mt-2 text-[10px] text-slate-500">
          Only the link is stored locally — its contents are not readable here, so the assistant
          only knows the title and URL.
        </p>
      </div>
    </div>
  );
}

/**
 * Floating document window. PDFs render as pages; .pptx decks render slide by
 * slide (Prev/Next + zoom + speaker notes); Google Slides links embed through
 * `/embed`, with an explicit explanation when Google refuses to frame a private
 * deck. Images render inline and other files show their extracted text. Drag,
 * minimize and maximize come from FloatingWindow.
 */
export function DocumentWindow({
  moon,
  star,
  planet,
  onDelete,
  onBack,
  onClose,
}: DocumentWindowProps) {
  const attachment = moon.attachments[0] ?? null;
  const linkAttachment =
    moon.attachments.find(
      (entry) => entry.mimeType === 'text/uri-list' || /^https?:\/\//i.test(entry.name),
    ) ?? null;
  const blob = useLiveQuery(
    () => (attachment ? getAttachmentBlob(attachment.id) : Promise.resolve(undefined)),
    [attachment?.id],
  );
  const [url, setUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  // Captured links live either in `sourceUrl` or as the stored uri-list part.
  useEffect(() => {
    let cancelled = false;
    const direct = moon.sourceUrl?.trim();
    if (direct && /^https?:\/\//i.test(direct)) {
      setLinkUrl(direct);
      return;
    }
    if (!linkAttachment) {
      setLinkUrl(null);
      return;
    }
    setLinkUrl(null);
    void getAttachmentBlob(linkAttachment.id)
      .then(async (stored) => {
        if (!stored || cancelled) return;
        const text = (await stored.text()).trim();
        if (!cancelled && /^https?:\/\//i.test(text)) setLinkUrl(text);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [moon.sourceUrl, linkAttachment?.id]);

  const kind = attachment ? detectKind(attachment.name, attachment.mimeType) : 'text';
  const status = extractionLabel(moon);
  const text = moon.extractedText?.trim() ?? '';
  const slidesUrl = isGoogleSlidesUrl(linkUrl) ? linkUrl : null;
  const attachmentIsLink = Boolean(attachment && linkAttachment?.id === attachment.id);
  const legacyPresentation = isLegacyPresentation(attachment?.name);
  const showTextDump =
    Boolean(attachment && blob) &&
    !slidesUrl &&
    !legacyPresentation &&
    kind !== 'pdf' &&
    kind !== 'image' &&
    kind !== 'pptx' &&
    !attachmentIsLink;

  return (
    <FloatingWindow
      title={moon.title}
      subtitle={`${star?.name ?? moon.topic ?? 'Unsorted'} › ${planet?.name ?? moon.unit ?? 'General'}${attachment && !attachmentIsLink ? ` · ${formatBytes(attachment.size)}` : ''}${slidesUrl ? ' · Google Slides' : attachment && kind === 'pptx' ? ' · slides' : ''}`}
      accent={star?.color ?? moon.topicColor ?? '#c6d6e8'}
      onBack={onBack}
      onClose={onClose}
      initial={{
        width: Math.min(680, Math.round(window.innerWidth * 0.56)),
        height: Math.min(720, Math.round(window.innerHeight * 0.8)),
      }}
      bodyClassName="bg-black/60"
      footer={
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span className={status.tone}>{status.text}</span>
          {moon.textChars ? <span>· {moon.textChars.toLocaleString()} chars</span> : null}
          {moon.extractionNote ? <span className="min-w-0 truncate">· {moon.extractionNote}</span> : null}
          <div className="ml-auto flex items-center gap-2">
            {url && attachment && !attachmentIsLink && (
              <a
                href={url}
                download={attachment.name}
                className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
              >
                Download
              </a>
            )}
            <button
              type="button"
              onClick={onDelete}
              title={`Delete ${moon.title}`}
              className="inline-flex items-center gap-1 rounded-md border border-[#1A1A1A] px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <TrashIcon className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      }
    >
      {slidesUrl && <GoogleSlidesView url={slidesUrl} extractedText={text} />}

      {!slidesUrl && !attachment && (
        <div className="p-4">
          <p className="mb-2 text-[11px] text-amber-300">
            This note has no stored file — showing only its text.
          </p>
          {text ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200">
              {text}
            </pre>
          ) : (
            <p className="text-[11px] text-slate-500">No text was captured for this note.</p>
          )}
        </div>
      )}

      {!slidesUrl && attachment && !blob && (
        <p className="p-4 text-[11px] text-slate-500">Loading file from local storage…</p>
      )}

      {!slidesUrl && attachment && blob && kind === 'pdf' && <PdfPages blob={blob} />}

      {!slidesUrl && attachment && blob && kind === 'pptx' && (
        <PptxSlides blob={blob} fallbackText={text} />
      )}

      {!slidesUrl && attachment && blob && kind === 'image' && (
        <div className="flex items-center justify-center p-3">
          {imageError ? (
            <p className="text-[11px] text-rose-300">This image could not be displayed.</p>
          ) : (
            url && (
              <img
                src={url}
                alt={moon.title}
                onError={() => setImageError(true)}
                className="max-h-[70vh] w-auto rounded-lg"
              />
            )
          )}
        </div>
      )}

      {!slidesUrl && legacyPresentation && <LegacyPresentationNotice name={attachment?.name ?? moon.title} />}

      {!slidesUrl && !legacyPresentation && linkUrl && (attachmentIsLink || !attachment) && (
        <LinkCard url={linkUrl} />
      )}

      {showTextDump && (
        <div className="p-4">
          {text ? (
            <>
              <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Extracted document text
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200">
                {text}
              </pre>
              {moon.extractionStatus && moon.extractionStatus !== 'ok' && (
                <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-200">
                  {moon.extractionNote ?? 'Text could not be extracted cleanly.'}
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-4">
              <p className="text-[11px] text-amber-300">No text could be extracted from this file.</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {moon.extractionNote ?? 'The AI will not guess its contents. Download it to read locally.'}
              </p>
            </div>
          )}
        </div>
      )}
    </FloatingWindow>
  );
}
