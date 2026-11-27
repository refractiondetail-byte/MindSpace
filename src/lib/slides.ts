import JSZip from 'jszip';

/**
 * Presentation support shared by the document window and the importer.
 *
 * - `parsePptxDeck` walks the OOXML parts of a .pptx (slide size, per-slide
 *   shape geometry, text runs with size/bold/colour, pictures, tables and
 *   speaker notes) so slides can be drawn visually instead of dumping text.
 * - `extractText` reuses the same deck so the stored slide text and notes stay
 *   identical to what the viewer shows.
 * - Google Slides links are normalised to their `/embed` form; embedding only
 *   works for decks shared publicly, which the viewer explains.
 *
 * Everything here is browser-only (DOMParser / canvas-free), pure data shaping.
 */

const EMU_PER_INCH = 914400;
const DEFAULT_SLIDE_WIDTH = 12_192_000;
const DEFAULT_SLIDE_HEIGHT = 6_858_000;
/** Media budget for one deck; beyond it slides render without their pictures. */
const MAX_EMBEDDED_MEDIA_BYTES = 16_000_000;

export type SlideAlign = 'l' | 'ctr' | 'r' | 'just';
export type SlideAnchor = 't' | 'ctr' | 'b';

export interface SlideRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  sizePt?: number | null;
  color?: string | null;
}

export interface SlideParagraph {
  runs: SlideRun[];
  align?: SlideAlign | null;
  level?: number;
}

export interface SlideShape {
  kind: 'text' | 'image' | 'rect';
  /** Slide coordinates in EMU. */
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string | null;
  paragraphs?: SlideParagraph[];
  defaultSizePt?: number;
  defaultColor?: string;
  anchor?: SlideAnchor;
  /** Data URL for pictures. */
  src?: string;
}

export interface SlidePage {
  /** 1-based slide number. */
  index: number;
  background: string | null;
  shapes: SlideShape[];
  text: string;
  notes: string;
}

export interface SlideDeck {
  /** Slide width/height in EMU. */
  width: number;
  height: number;
  slides: SlidePage[];
  hasNotes: boolean;
  /** Pictures dropped because the deck exceeded the media budget. */
  omittedImages: number;
}

export interface ParseDeckOptions {
  /** Set false for text extraction: skips decoding every picture. */
  includeImages?: boolean;
}

/* ------------------------------------------------------- Google Slides */

function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/** True for any `docs.google.com/presentation/d/…` link (edit, view or embed). */
export function isGoogleSlidesUrl(raw: string | null | undefined): boolean {
  const url = safeUrl(raw);
  if (!url) return false;
  if (url.hostname !== 'docs.google.com') return false;
  return /^\/presentation\/d\//.test(url.pathname);
}

/** Presentation id, including the long id used by "publish to web" links. */
export function googleSlidesPresentationId(raw: string | null | undefined): string | null {
  const url = safeUrl(raw);
  if (!url || !isGoogleSlidesUrl(raw)) return null;
  const match = /^\/presentation\/d\/(?:e\/)?([\w-]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

/**
 * `/embed` URL for the deck. A presentation only embeds when it is shared with
 * "Anyone with the link"; the viewer explains that when Google refuses.
 */
export function googleSlidesEmbedUrl(raw: string | null | undefined): string | null {
  const url = safeUrl(raw);
  const id = googleSlidesPresentationId(raw);
  if (!url || !id) return null;
  const published = /^\/presentation\/d\/e\//.test(url.pathname);
  const base = published
    ? `https://docs.google.com/presentation/d/e/${id}/pubembed`
    : `https://docs.google.com/presentation/d/${id}/embed`;
  return `${base}?start=false&loop=false&delayms=3000`;
}

/** Canonical "open in Google Slides" URL (edit for private, pub for published). */
export function googleSlidesOpenUrl(raw: string | null | undefined): string | null {
  const url = safeUrl(raw);
  const id = googleSlidesPresentationId(raw);
  if (!url || !id) return null;
  return /^\/presentation\/d\/e\//.test(url.pathname)
    ? `https://docs.google.com/presentation/d/e/${id}/pub`
    : `https://docs.google.com/presentation/d/${id}/edit`;
}

/** Old binary PowerPoint parts that no browser-side parser can read. */
export const LEGACY_PRESENTATION_EXTENSIONS = new Set(['ppt', 'pps', 'ppsm', 'pot']);

export function isLegacyPresentation(name: string | null | undefined): boolean {
  if (!name) return false;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return LEGACY_PRESENTATION_EXTENSIONS.has(ext);
}

/* ------------------------------------------------------------- PPTX XML */

const MEDIA_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/** Default Office theme colours, so `schemeClr` text/fills still render. */
const SCHEME_COLORS: Record<string, string> = {
  tx1: '#000000',
  tx2: '#44546a',
  dk1: '#000000',
  dk2: '#44546a',
  lt1: '#ffffff',
  lt2: '#e7e6e6',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  hlink: '#0563c1',
  folHlink: '#954f72',
};

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SlideRelationship {
  id: string;
  /** Zip path of the related part. */
  target: string;
  type: string;
}

function localNameOf(node: Element): string {
  return node.localName || node.nodeName.split(':').pop() || '';
}

function childElements(parent: Element, name: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i += 1) {
    const child = parent.children[i];
    if (localNameOf(child) === name) out.push(child);
  }
  return out;
}

function firstChild(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i += 1) {
    const child = parent.children[i];
    if (localNameOf(child) === name) return child;
  }
  return null;
}

function descendants(parent: Element, name: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      if (localNameOf(child) === name) out.push(child);
      walk(child);
    }
  };
  walk(parent);
  return out;
}

function firstDescendantNamed(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  const walk = (node: Element): Element | null => {
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      if (localNameOf(child) === name) return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(parent);
}

function numberAttr(node: Element | null | undefined, name: string): number | null {
  if (!node) return null;
  const raw = node.getAttribute(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function attributeIn(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : null;
}

function relationshipId(element: Element, name: string): string | null {
  return element.getAttributeNS(REL_NS, name) ?? element.getAttribute(`r:${name}`) ?? null;
}

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (!doc || doc.getElementsByTagName('parsererror').length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

function parseXfrmElement(xfrm: Element | null): Box | null {
  if (!xfrm) return null;
  const off = firstChild(xfrm, 'off');
  const ext = firstChild(xfrm, 'ext');
  const x = numberAttr(off, 'x');
  const y = numberAttr(off, 'y');
  const w = numberAttr(ext, 'cx');
  const h = numberAttr(ext, 'cy');
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

function parseBox(shapeProperties: Element | null): Box | null {
  if (!shapeProperties) return null;
  return parseXfrmElement(firstChild(shapeProperties, 'xfrm'));
}

function colorFromSolidFill(fill: Element | null): string | null {
  if (!fill) return null;
  const srgb = firstChild(fill, 'srgbClr');
  const srgbVal = srgb?.getAttribute('val');
  if (srgbVal) return `#${srgbVal}`;
  const scheme = firstChild(fill, 'schemeClr');
  const schemeVal = scheme?.getAttribute('val');
  if (schemeVal) return SCHEME_COLORS[schemeVal] ?? null;
  return null;
}

function placeholderKey(type: string | null, index: string | null): string {
  return `${type ?? 'body'}:${index ?? '0'}`;
}

function defaultPlaceholderBox(type: string | null): Box {
  if (type === 'title' || type === 'ctrTitle') {
    return { x: 838200, y: 365125, w: 10_515_600, h: 1_325_563 };
  }
  if (type === 'subTitle') {
    return { x: 1_524_000, y: 3_708_400, w: 9_144_000, h: 1_655_763 };
  }
  return { x: 838200, y: 1_825_625, w: 10_515_600, h: 4_351_338 };
}

function parseParagraphs(textBody: Element | null): SlideParagraph[] {
  if (!textBody) return [];
  const paragraphs: SlideParagraph[] = [];
  for (const paragraph of childElements(textBody, 'p')) {
    const paragraphProperties = firstChild(paragraph, 'pPr');
    const runs: SlideRun[] = [];
    for (let i = 0; i < paragraph.children.length; i += 1) {
      const child = paragraph.children[i];
      const name = localNameOf(child);
      if (name === 'r' || name === 'fld') {
        const text = firstChild(child, 't')?.textContent ?? '';
        if (!text) continue;
        const runProperties = firstChild(child, 'rPr');
        const size = numberAttr(runProperties, 'sz');
        runs.push({
          text,
          bold: runProperties?.getAttribute('b') === '1',
          italic: runProperties?.getAttribute('i') === '1',
          sizePt: size !== null ? size / 100 : null,
          color: colorFromSolidFill(
            runProperties ? firstChild(runProperties, 'solidFill') : null,
          ),
        });
      } else if (name === 'br') {
        runs.push({ text: '\n' });
      }
    }
    if (!runs.length) continue;
    const align = paragraphProperties?.getAttribute('algn') as SlideAlign | null | undefined;
    paragraphs.push({
      runs,
      align: align ?? null,
      level: numberAttr(paragraphProperties, 'lvl') ?? 0,
    });
  }
  return paragraphs;
}

function paragraphsToText(paragraphs: SlideParagraph[] | undefined): string {
  if (!paragraphs?.length) return '';
  return paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\n')
    .trim();
}

/* ----------------------------------------------------------- part paths */

function resolvePartPath(directory: string, target: string): string {
  const clean = (() => {
    try {
      return decodeURIComponent(target);
    } catch {
      return target;
    }
  })();
  if (clean.startsWith('/')) return clean.slice(1);
  const segments = `${directory}/${clean}`.split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

async function readRelationships(
  zip: JSZip,
  partPath: string,
): Promise<Map<string, SlideRelationship>> {
  const slash = partPath.lastIndexOf('/');
  const directory = slash >= 0 ? partPath.slice(0, slash) : '';
  const name = partPath.slice(slash + 1);
  const relsPath = `${directory}/_rels/${name}.rels`;
  const xml = await zip.file(relsPath)?.async('string');
  const relationships = new Map<string, SlideRelationship>();
  if (!xml) return relationships;

  for (const match of xml.matchAll(/<Relationship\b([^>]*)>/g)) {
    const attrs = match[1];
    const id = attributeIn(attrs, 'Id');
    const target = attributeIn(attrs, 'Target');
    if (!id || !target) continue;
    relationships.set(id, {
      id,
      target: resolvePartPath(directory, target),
      type: attributeIn(attrs, 'Type') ?? '',
    });
  }
  return relationships;
}

function slideNumber(path: string): number {
  const match = /slide(\d+)\.xml$/.exec(path);
  return match ? Number(match[1]) : 0;
}

/* --------------------------------------------------------------- parts */

async function readLayoutPlaceholders(
  zip: JSZip,
  layoutPath: string | null,
): Promise<Map<string, Box>> {
  const boxes = new Map<string, Box>();
  if (!layoutPath) return boxes;
  const xml = await zip.file(layoutPath)?.async('string');
  if (!xml) return boxes;
  const doc = parseXml(xml);
  const tree = doc ? firstDescendantNamed(doc.documentElement, 'spTree') : null;
  if (!tree) return boxes;

  for (const shape of childElements(tree, 'sp')) {
    const placeholder = firstChild(firstChild(shape, 'nvSpPr'), 'nvPr');
    const ph = placeholder ? firstChild(placeholder, 'ph') : null;
    if (!ph) continue;
    const box = parseBox(firstChild(shape, 'spPr'));
    if (!box) continue;
    const key = placeholderKey(ph.getAttribute('type'), ph.getAttribute('idx'));
    if (!boxes.has(key)) boxes.set(key, box);
  }
  return boxes;
}

function readBackground(root: Element | null): string | null {
  if (!root) return null;
  const commonSlideData = firstChild(root, 'cSld');
  const background = commonSlideData ? firstChild(commonSlideData, 'bg') : null;
  const backgroundProperties = background ? firstChild(background, 'bgPr') : null;
  return colorFromSolidFill(
    backgroundProperties ? firstChild(backgroundProperties, 'solidFill') : null,
  );
}

interface SlideContext {
  loadMedia: (path: string) => Promise<string | null>;
}

function readTextShape(
  shape: Element,
  dx: number,
  dy: number,
  layoutBoxes: Map<string, Box>,
): SlideShape | null {
  const shapeProperties = firstChild(shape, 'spPr');
  const nonVisual = firstChild(shape, 'nvSpPr');
  const nonVisualProperties = nonVisual ? firstChild(nonVisual, 'nvPr') : null;
  const ph = nonVisualProperties ? firstChild(nonVisualProperties, 'ph') : null;
  const phType = ph?.getAttribute('type') ?? null;
  const phIndex = ph?.getAttribute('idx') ?? null;

  // Slide-number/footer/date placeholders only render on the master.
  if (phType && ['sldNum', 'ftr', 'dt'].includes(phType)) return null;

  let box = parseBox(shapeProperties);
  if (!box && ph) {
    box =
      layoutBoxes.get(placeholderKey(phType, phIndex)) ??
      layoutBoxes.get(placeholderKey(phType, null)) ??
      layoutBoxes.get(placeholderKey('body', phIndex)) ??
      layoutBoxes.get(placeholderKey('body', null)) ??
      null;
  }
  if (!box) box = defaultPlaceholderBox(phType);

  const textBody = firstChild(shape, 'txBody');
  const paragraphs = parseParagraphs(textBody);
  const fill = colorFromSolidFill(shapeProperties ? firstChild(shapeProperties, 'solidFill') : null);
  const anchor =
    (textBody ? firstChild(textBody, 'bodyPr')?.getAttribute('anchor') : null) ?? 't';

  const boxValues = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };

  if (!paragraphs.length) {
    return fill ? { kind: 'rect', ...boxValues, fill } : null;
  }

  const isTitle = phType === 'title' || phType === 'ctrTitle';
  return {
    kind: 'text',
    ...boxValues,
    fill,
    paragraphs,
    defaultSizePt: isTitle ? 34 : 18,
    defaultColor: '#111111',
    anchor: anchor === 'ctr' || anchor === 'b' ? anchor : 't',
  };
}

function readPictureShape(picture: Element, dx: number, dy: number): SlideShape | null {
  const box = parseBox(firstChild(picture, 'spPr'));
  if (!box) return null;
  return { kind: 'image', x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
}

function readGraphicFrame(frame: Element, dx: number, dy: number): SlideShape | null {
  const box = parseXfrmElement(firstChild(frame, 'xfrm'));
  if (!box) return null;
  const paragraphs: SlideParagraph[] = [];
  for (const cell of descendants(frame, 'tc')) {
    paragraphs.push(...parseParagraphs(firstChild(cell, 'txBody')));
  }
  if (!paragraphs.length) return null;
  return {
    kind: 'text',
    x: box.x + dx,
    y: box.y + dy,
    w: box.w,
    h: box.h,
    paragraphs,
    defaultSizePt: 14,
    defaultColor: '#111111',
    anchor: 't',
  };
}

async function readNotes(
  zip: JSZip,
  relationships: Map<string, SlideRelationship>,
): Promise<string> {
  const rel = [...relationships.values()].find((entry) => entry.type.endsWith('/notesSlide'));
  if (!rel) return '';
  const xml = await zip.file(rel.target)?.async('string');
  if (!xml) return '';
  const doc = parseXml(xml);
  if (!doc) return '';

  const chunks: string[] = [];
  for (const textBody of descendants(doc.documentElement, 'txBody')) {
    const text = paragraphsToText(parseParagraphs(textBody));
    // The auto-populated slide-number placeholder is just a bare number.
    if (text && !/^\d+$/.test(text)) chunks.push(text);
  }
  return chunks.join('\n\n').trim().slice(0, 8000);
}

async function parseSlide(
  zip: JSZip,
  slidePath: string,
  index: number,
  context: SlideContext,
): Promise<SlidePage> {
  const xml = await zip.file(slidePath)?.async('string');
  if (!xml) return { index, background: null, shapes: [], text: '', notes: '' };
  const doc = parseXml(xml);
  const root = doc?.documentElement ?? null;
  const tree = root ? firstDescendantNamed(root, 'spTree') : null;
  const background = readBackground(root);
  const relationships = await readRelationships(zip, slidePath);

  const layoutRel = [...relationships.values()].find((rel) => rel.type.endsWith('/slideLayout'));
  const layoutBoxes = await readLayoutPlaceholders(zip, layoutRel?.target ?? null);

  const shapes: SlideShape[] = [];
  const pictures: Array<{ shape: SlideShape; target: string | null }> = [];

  const walk = (node: Element, dx: number, dy: number) => {
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      const name = localNameOf(child);
      if (name === 'sp') {
        const shape = readTextShape(child, dx, dy, layoutBoxes);
        if (shape) shapes.push(shape);
      } else if (name === 'pic') {
        const shape = readPictureShape(child, dx, dy);
        if (!shape) continue;
        const blip = firstDescendantNamed(child, 'blip');
        const rid = blip ? relationshipId(blip, 'embed') : null;
        pictures.push({ shape, target: rid ? relationships.get(rid)?.target ?? null : null });
        shapes.push(shape);
      } else if (name === 'graphicFrame') {
        const shape = readGraphicFrame(child, dx, dy);
        if (shape) shapes.push(shape);
      } else if (name === 'grpSp') {
        const groupProperties = firstChild(child, 'grpSpPr');
        const xfrm = groupProperties ? firstChild(groupProperties, 'xfrm') : null;
        const off = xfrm ? firstChild(xfrm, 'off') : null;
        const childOff = xfrm ? firstChild(xfrm, 'chOff') : null;
        const groupDx = (numberAttr(off, 'x') ?? 0) - (numberAttr(childOff, 'x') ?? 0);
        const groupDy = (numberAttr(off, 'y') ?? 0) - (numberAttr(childOff, 'y') ?? 0);
        walk(child, dx + groupDx, dy + groupDy);
      }
    }
  };
  if (tree) walk(tree, 0, 0);

  for (const picture of pictures) {
    if (!picture.target) continue;
    // eslint-disable-next-line no-await-in-loop
    const src = await context.loadMedia(picture.target);
    if (src) picture.shape.src = src;
  }

  const textParts: string[] = [];
  for (const shape of shapes) {
    const text = paragraphsToText(shape.paragraphs);
    if (text) textParts.push(text);
  }

  const notes = await readNotes(zip, relationships);

  return {
    index,
    background,
    shapes,
    text: textParts.join('\n').trim(),
    notes,
  };
}

/* ---------------------------------------------------------------- deck */

/** Parse a .pptx into slides the viewer can draw and the AI can read. */
export async function parsePptxDeck(
  data: ArrayBuffer,
  options: ParseDeckOptions = {},
): Promise<SlideDeck> {
  const includeImages = options.includeImages !== false;
  const zip = await JSZip.loadAsync(data);

  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
  const presentationDoc = presentationXml ? parseXml(presentationXml) : null;
  const size = presentationDoc
    ? firstDescendantNamed(presentationDoc.documentElement, 'sldSz')
    : null;
  let width = numberAttr(size, 'cx') ?? DEFAULT_SLIDE_WIDTH;
  let height = numberAttr(size, 'cy') ?? DEFAULT_SLIDE_HEIGHT;
  if (!(width > 0) || !(height > 0)) {
    width = DEFAULT_SLIDE_WIDTH;
    height = DEFAULT_SLIDE_HEIGHT;
  }

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slidePaths.length) {
    return { width, height, slides: [], hasNotes: false, omittedImages: 0 };
  }

  const mediaCache = new Map<string, string | null>();
  let mediaBytes = 0;
  let omittedImages = 0;

  const loadMedia = async (path: string): Promise<string | null> => {
    if (!includeImages) return null;
    if (mediaCache.has(path)) return mediaCache.get(path) ?? null;
    const file = zip.file(path);
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    const mime = MEDIA_MIME[extension];
    if (!file || !mime) {
      mediaCache.set(path, null);
      return null;
    }
    if (mediaBytes > MAX_EMBEDDED_MEDIA_BYTES) {
      omittedImages += 1;
      mediaCache.set(path, null);
      return null;
    }
    const base64 = await file.async('base64');
    mediaBytes += base64.length * 0.75;
    const dataUrl = `data:${mime};base64,${base64}`;
    mediaCache.set(path, dataUrl);
    return dataUrl;
  };

  const slides: SlidePage[] = [];
  let hasNotes = false;
  for (const [position, path] of slidePaths.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const slide = await parseSlide(zip, path, position + 1, { loadMedia });
    if (slide.notes) hasNotes = true;
    slides.push(slide);
  }

  return { width, height, slides, hasNotes, omittedImages };
}

/** Convert EMU to CSS pixels for a slide drawn at `widthPx`. */
export function emuScale(widthPx: number, deckWidth: number): number {
  return deckWidth > 0 ? widthPx / deckWidth : 1;
}

export { EMU_PER_INCH };
