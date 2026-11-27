import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentExtractionStatus } from '../core/types';
import { parsePptxDeck } from './slides';
import { compressImageForUpload, fileToBase64 } from './supabaseStorage';

/**
 * Browser-side document text extraction.
 *
 * The AI organizer and the chat are only as good as the text we hand them, so
 * every uploaded file is read locally before a request is made:
 *  - PDF   → per-page text layer via pdf.js
 *  - DOCX  → `word/document.xml` from the OOXML zip
 *  - PPTX  → per-slide text runs and speaker notes (shared parser in `slides.ts`)
 *  - TXT/MD/CSV/… → File.text()
 *  - images → no local OCR; the (compressed) image is sent for vision instead
 *
 * Text is capped so a huge PDF cannot blow the host's request-body limit.
 * Whenever nothing could be read, `status` says why and `note` is surfaced to
 * the AI and the UI so they never fabricate document contents.
 */

/** Per-file cap for text sent to the AI. */
export const MAX_TEXT_CHARS_PER_FILE = 40_000;
/** Batch cap across all files of one import (keeps payloads below ~200 KB). */
export const MAX_LIBRARY_TEXT_CHARS = 120_000;
/** Largest compressed image worth inlining as base64 (base64 is ~1.37×). */
export const MAX_INLINE_IMAGE_BYTES = 2_000_000;
/** Total base64 chars for all images in one import, under the 4.5 MB body limit. */
export const MAX_TOTAL_INLINE_IMAGE_CHARS = 3_000_000;
/** Hard stop on PDF page walking for very long documents. */
export const MAX_PDF_PAGES = 80;

export type ExtractedKind = 'pdf' | 'docx' | 'pptx' | 'text' | 'image' | 'other';

export interface ExtractedDocument {
  name: string;
  mimeType: string;
  size: number;
  kind: ExtractedKind;
  status: DocumentExtractionStatus;
  text: string;
  chars: number;
  truncated: boolean;
  /** Human/AI-readable explanation when status is not `ok`. */
  note?: string;
  /** Images only: compressed inline payload for multimodal extraction. */
  imageBase64?: string;
  imageMimeType?: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'rtf', 'html', 'htm',
  'xml', 'yaml', 'yml', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'h',
  'cpp', 'cs', 'go', 'rs', 'sql', 'tex', 'srt', 'vtt',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'svg']);

const LEGACY_OFFICE = new Set(['doc', 'ppt', 'xls']);

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function detectKind(name: string, mimeType: string): ExtractedKind {
  const ext = extensionOf(name);
  const mime = (mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === 'pptx' || mime.includes('presentationml')) return 'pptx';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'other';
}

/** Collapse the ragged whitespace pdf/slide XML export tends to produce. */
function tidy(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…[truncated]`, truncated: true };
}

function failure(
  file: Pick<File, 'name' | 'size'>,
  kind: ExtractedKind,
  status: DocumentExtractionStatus,
  note: string,
  mimeType = '',
): ExtractedDocument {
  return {
    name: file.name,
    mimeType,
    size: file.size,
    kind,
    status,
    text: '',
    chars: 0,
    truncated: false,
    note,
  };
}

/* ------------------------------------------------------------------- PDF */

async function extractPdf(file: File): Promise<ExtractedDocument> {
  const mimeType = 'application/pdf';
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const chunks: string[] = [];
    let chars = 0;
    let truncated = false;

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(pageNumber);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      page.cleanup();
      const clean = tidy(pageText);
      if (!clean) continue;
      chunks.push(clean);
      chars += clean.length;
      if (chars >= MAX_TEXT_CHARS_PER_FILE) {
        truncated = true;
        break;
      }
    }
    void loadingTask.destroy();

    const combined = clip(tidy(chunks.join('\n\n')), MAX_TEXT_CHARS_PER_FILE);
    const wasTruncated = truncated || combined.truncated;
    if (!combined.text) {
      return failure(
        file,
        'pdf',
        'empty',
        `No text layer found in this PDF (${pages} page${pages === 1 ? '' : 's'} scanned). It is probably a scan or image-only export, so its contents are unknown.`,
        mimeType,
      );
    }
    return {
      name: file.name,
      mimeType,
      size: file.size,
      kind: 'pdf',
      status: 'ok',
      text: combined.text,
      chars: combined.text.length,
      truncated: wasTruncated,
      note: wasTruncated
        ? `Only the first ${combined.text.length.toLocaleString()} characters (${pages} page cap) were read.`
        : undefined,
    };
  } catch (error) {
    return failure(
      file,
      'pdf',
      'error',
      `PDF text extraction failed (${error instanceof Error ? error.message : String(error)}). Do not assume its contents.`,
      mimeType,
    );
  }
}

/* ------------------------------------------------------- DOCX / PPTX (zip) */

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) {
      return failure(file, 'docx', 'empty', 'This .docx has no word/document.xml part.', mimeType);
    }
    const withBreaks = xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n');
    const stripped = decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, ''));
    const combined = clip(tidy(stripped), MAX_TEXT_CHARS_PER_FILE);
    if (!combined.text) {
      return failure(file, 'docx', 'empty', 'The document body contained no readable text.', mimeType);
    }
    return {
      name: file.name,
      mimeType,
      size: file.size,
      kind: 'docx',
      status: 'ok',
      text: combined.text,
      chars: combined.text.length,
      truncated: combined.truncated,
      note: combined.truncated ? 'Only the start of the document was read.' : undefined,
    };
  } catch (error) {
    return failure(
      file,
      'docx',
      'error',
      `DOCX extraction failed (${error instanceof Error ? error.message : String(error)}).`,
      mimeType,
    );
  }
}

async function extractPptx(file: File): Promise<ExtractedDocument> {
  const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  try {
    // The viewer draws the deck from the same parse, so stored slide text and
    // speaker notes always match what the document window shows.
    const deck = await parsePptxDeck(await file.arrayBuffer(), { includeImages: false });
    if (deck.slides.length === 0) {
      return failure(file, 'pptx', 'empty', 'The presentation contained no slide parts.', mimeType);
    }

    const chunks: string[] = [];
    let chars = 0;
    let truncated = false;
    let notesRead = 0;

    for (const slide of deck.slides) {
      if (!slide.text && !slide.notes) continue;
      const parts = [`Slide ${slide.index}`];
      if (slide.text) parts.push(slide.text);
      if (slide.notes) {
        parts.push(`Speaker notes: ${slide.notes}`);
        notesRead += 1;
      }
      const block = tidy(parts.join('\n'));
      chunks.push(block);
      chars += block.length;
      if (chars >= MAX_TEXT_CHARS_PER_FILE) {
        truncated = true;
        break;
      }
    }

    const combined = clip(chunks.join('\n\n'), MAX_TEXT_CHARS_PER_FILE);
    if (!combined.text) {
      return failure(
        file,
        'pptx',
        'empty',
        'The slides contained no text runs or speaker notes (image-only deck).',
        mimeType,
      );
    }
    const wasTruncated = truncated || combined.truncated;
    return {
      name: file.name,
      mimeType,
      size: file.size,
      kind: 'pptx',
      status: 'ok',
      text: combined.text,
      chars: combined.text.length,
      truncated: wasTruncated,
      note: wasTruncated
        ? 'Only the first slides were read.'
        : notesRead > 0
          ? `Read ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'} plus speaker notes.`
          : undefined,
    };
  } catch (error) {
    return failure(
      file,
      'pptx',
      'error',
      `PPTX extraction failed (${error instanceof Error ? error.message : String(error)}).`,
      mimeType,
    );
  }
}

/* -------------------------------------------------------- text and images */

async function extractPlainText(file: File, mimeType: string): Promise<ExtractedDocument> {
  try {
    const raw = await file.text();
    const combined = clip(tidy(raw), MAX_TEXT_CHARS_PER_FILE);
    if (!combined.text) {
      return failure(file, 'text', 'empty', 'The file was empty.', mimeType || 'text/plain');
    }
    return {
      name: file.name,
      mimeType: mimeType || 'text/plain',
      size: file.size,
      kind: 'text',
      status: 'ok',
      text: combined.text,
      chars: combined.text.length,
      truncated: combined.truncated,
    };
  } catch (error) {
    return failure(
      file,
      'text',
      'error',
      `Text read failed (${error instanceof Error ? error.message : String(error)}).`,
      mimeType,
    );
  }
}

async function extractImage(file: File): Promise<ExtractedDocument> {
  try {
    const prepared = await compressImageForUpload(file);
    if (prepared.size > MAX_INLINE_IMAGE_BYTES) {
      return failure(
        file,
        'image',
        'empty',
        `Image is too large to send for vision (${Math.round(prepared.size / 1024)} KB after compression). The filename is the only known information.`,
        prepared.type || file.type,
      );
    }
    return {
      name: file.name,
      mimeType: prepared.type || file.type || 'image/jpeg',
      size: prepared.size,
      kind: 'image',
      status: 'empty',
      text: '',
      chars: 0,
      truncated: false,
      note: 'No local OCR for images; the image is sent to the AI vision model instead.',
      imageBase64: await fileToBase64(prepared),
      imageMimeType: prepared.type || file.type || 'image/jpeg',
    };
  } catch (error) {
    return failure(
      file,
      'image',
      'error',
      `Image preparation failed (${error instanceof Error ? error.message : String(error)}).`,
      file.type,
    );
  }
}

/**
 * Read one file. Never throws: failures come back as `status: 'error'` with a
 * `note` so the import can continue and the AI can be told what is missing.
 */
export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const kind = detectKind(file.name, file.type);
  if (kind === 'pdf') return extractPdf(file);
  if (kind === 'docx') return extractDocx(file);
  if (kind === 'pptx') return extractPptx(file);
  if (kind === 'image') return extractImage(file);
  if (kind === 'text') return extractPlainText(file, file.type);

  const ext = extensionOf(file.name);
  const status: DocumentExtractionStatus = LEGACY_OFFICE.has(ext) ? 'unsupported' : 'unsupported';
  return failure(
    file,
    'other',
    status,
    LEGACY_OFFICE.has(ext)
      ? `Legacy .${ext} files are not readable in the browser. Re-save as .${ext}x to let the AI read it.`
      : 'This file type has no readable text layer. Only its filename and metadata are known.',
    file.type,
  );
}

/** Extract several files and enforce the batch-wide character budget. */
export async function extractDocuments(files: File[]): Promise<ExtractedDocument[]> {
  const results: ExtractedDocument[] = [];
  let textBudget = MAX_LIBRARY_TEXT_CHARS;
  let imageBudget = MAX_TOTAL_INLINE_IMAGE_CHARS;

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const extracted = await extractDocument(file);
    let next = extracted;

    // Images are far bulkier than text, so they share a separate inline budget.
    if (next.imageBase64) {
      if (next.imageBase64.length > imageBudget) {
        next = {
          ...next,
          imageBase64: undefined,
          imageMimeType: undefined,
          status: 'empty',
          note: 'Image omitted: this batch already used its inline image budget. Its contents are unknown.',
        };
      } else {
        imageBudget -= next.imageBase64.length;
      }
    }

    if (textBudget <= 0 && next.text) {
      results.push({
        ...next,
        text: '',
        chars: 0,
        truncated: true,
        note: `${next.note ?? ''} Batch text budget reached; contents omitted.`.trim(),
      });
      continue;
    }
    if (next.text.length > textBudget) {
      const sliced = next.text.slice(0, textBudget);
      results.push({
        ...next,
        text: sliced,
        chars: sliced.length,
        truncated: true,
        note: `${next.note ?? ''} Trimmed to the batch text budget.`.trim(),
      });
      textBudget = 0;
      continue;
    }
    textBudget -= next.text.length;
    results.push(next);
  }

  return results;
}
