import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  points: Point[];
}

interface ImageViewerProps {
  url: string;
  name: string;
  onClose: () => void;
  onFocus?: () => void;
}

export function ImageViewer({ url, name, onClose, onFocus }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [penMode, setPenMode] = useState(false);
  const [color, setColor] = useState('#ff3b30');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [pos, setPos] = useState({ x: 80, y: 80 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zIndexRef = useRef(50);
  const [zIndex, setZIndex] = useState(50);

  function bringToFront() {
    zIndexRef.current += 1;
    setZIndex(zIndexRef.current);
    onFocus?.();
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    setSize({ width: image.naturalWidth, height: image.naturalHeight });
  }

  function toSvg(event: ReactPointerEvent<SVGSVGElement>): Point | null {
    const svg = svgRef.current;
    if (!svg || size.width === 0) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * size.width;
    const y = ((event.clientY - rect.top) / rect.height) * size.height;
    return { x, y };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!penMode) return;
    event.preventDefault();
    const point = toSvg(event);
    if (!point) return;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
    setCurrent({ color, points: [point] });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!penMode || !current) return;
    const point = toSvg(event);
    if (!point) return;
    setCurrent((stroke) =>
      stroke ? { ...stroke, points: [...stroke.points, point] } : stroke,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!penMode || !current) return;
    (event.currentTarget as SVGSVGElement).releasePointerCapture(event.pointerId);
    setStrokes((previous) => [...previous, current]);
    setCurrent(null);
  }

  function handleTitlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (maximized) return;
    bringToFront();
    setDragging(true);
    dragOffset.current = { x: event.clientX - pos.x, y: event.clientY - pos.y };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }

  function handleTitlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || maximized) return;
    setPos({ x: event.clientX - dragOffset.current.x, y: event.clientY - dragOffset.current.y });
  }

  function handleTitlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    setDragging(false);
    (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
  }

  const pathFor = (stroke: Stroke) =>
    stroke.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

  return (
    <div
      className={`pointer-events-auto fixed flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0d12] shadow-2xl ${
        maximized ? 'inset-4' : ''
      }`}
      style={
        maximized
          ? { zIndex }
          : { left: pos.x, top: pos.y, width: 720, zIndex }
      }
      onPointerDown={bringToFront}
    >
      <div
        className="flex cursor-move items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2"
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200">{name}</p>
        </div>
        <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            −
          </button>
          <span className="w-12 text-center text-[10px] tabular-nums text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setPenMode((value) => !value)}
            aria-pressed={penMode}
            className={`rounded-md border px-2 py-1 text-[10px] ${
              penMode
                ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                : 'border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            Pen
          </button>
          {penMode && (
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-6 w-6 cursor-pointer rounded border border-white/10 bg-transparent"
              title="Pen color"
            />
          )}
          <button
            type="button"
            onClick={() => setStrokes([])}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setMinimized((value) => !value)}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            {minimized ? '▢' : '—'}
          </button>
          <button
            type="button"
            onClick={() => setMaximized((value) => !value)}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            {maximized ? '⤓' : '⤢'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {!minimized && (        <div className="relative flex flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
            <div
              className="relative inline-block origin-top-left"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              <img
                src={url}
                alt={name}
                onLoad={handleImageLoad}
                className={
                  maximized
                    ? 'block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-2rem)] select-none'
                    : 'block max-h-[70vh] w-auto select-none'
                }
                draggable={false}
              />
            {size.width > 0 && (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${size.width} ${size.height}`}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: penMode ? 'crosshair' : 'default' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {strokes.map((stroke, index) => (
                  <path
                    key={index}
                    d={pathFor(stroke)}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {current && (
                  <path
                    d={pathFor(current)}
                    fill="none"
                    stroke={current.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
