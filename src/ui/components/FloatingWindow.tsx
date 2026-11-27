import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

interface FloatingWindowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  accent?: string;
  /** When present a back arrow is shown, stepping one level up the hierarchy. */
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initial?: { x?: number; y?: number; width?: number; height?: number };
  bodyClassName?: string;
  zIndex?: number;
}

let globalZ = 60;
/** How long the open/close fade and slide takes, in milliseconds. */
const EXIT_MS = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Draggable / minimizable / maximizable glass window used by the planet panel
 * and the document viewer. Pointer capture keeps the drag intact on touch.
 */
export function FloatingWindow({
  title,
  subtitle,
  toolbar,
  accent = '#c6d6e8',
  onBack,
  onClose,
  children,
  footer,
  initial,
  bodyClassName = '',
  zIndex = 60,
}: FloatingWindowProps) {
  const [pos, setPos] = useState({
    x: initial?.x ?? Math.max(16, Math.round(window.innerWidth * 0.52)),
    y: initial?.y ?? 92,
  });
  const [size] = useState({
    width: initial?.width ?? Math.min(520, Math.round(window.innerWidth * 0.46)),
    height: initial?.height ?? Math.min(620, Math.round(window.innerHeight * 0.74)),
  });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [z, setZ] = useState(zIndex);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const zRef = useRef(zIndex);

  // Windows fade/slide in and out instead of snapping into place. Closing and
  // going back both wait for the short exit transition before unmounting.
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const [visible, setVisible] = useState(reducedMotion);
  const closing = useRef(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    // `closing` keeps an exit from being undone by the enter effect below.
    if (visible || closing.current) return;
    // Two frames so the hidden style paints before the transition starts.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [visible]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  const leave = useCallback(
    (after: () => void) => {
      if (closing.current) return;
      closing.current = true;
      if (reducedMotion) {
        after();
        return;
      }
      setVisible(false);
      exitTimer.current = window.setTimeout(after, EXIT_MS);
    },
    [reducedMotion],
  );

  const bringToFront = useCallback(() => {
    globalZ += 1;
    zRef.current = globalZ;
    setZ(zRef.current);
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((current) => ({
        x: clamp(current.x, 8, Math.max(8, window.innerWidth - size.width - 8)),
        y: clamp(current.y, 8, Math.max(8, window.innerHeight - 64)),
      }));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size.width]);

  function onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (maximized) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    offset.current = { x: event.clientX - pos.x, y: event.clientY - pos.y };
    bringToFront();
  }

  function onDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    setPos({
      x: clamp(event.clientX - offset.current.x, 8, Math.max(8, window.innerWidth - 120)),
      y: clamp(event.clientY - offset.current.y, 8, Math.max(8, window.innerHeight - 48)),
    });
  }

  function onDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const frameStyle = maximized
    ? { inset: 8, zIndex: z }
    : minimized
      ? { left: pos.x, top: pos.y, width: Math.min(size.width, 360), height: 40, zIndex: z }
      : { left: pos.x, top: pos.y, width: size.width, height: size.height, zIndex: z };

  return (
    <section
      className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07080b]/95 shadow-2xl backdrop-blur-xl"
      style={{
        ...frameStyle,
        borderColor: `${accent}33`,
        boxShadow: `0 24px 70px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.975)',
        transition: reducedMotion
          ? undefined
          : `opacity ${EXIT_MS}ms ease-out, transform ${EXIT_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        willChange: 'opacity, transform',
      }}
      onPointerDown={bringToFront}
      aria-label={typeof title === 'string' ? title : 'Window'}
    >
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5"
        style={{ touchAction: 'none' }}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {onBack && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => leave(onBack)}
            title="Back"
            aria-label="Back"
            className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] leading-none text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            ‹
          </button>
        )}
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }}
        />
        <div className="pointer-events-none min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-slate-200">{title}</p>
          {subtitle && !minimized && (
            <p className="truncate text-[10px] text-slate-500">{subtitle}</p>
          )}
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!minimized && toolbar}
          <button
            type="button"
            onClick={() => setMinimized((value) => !value)}
            title={minimized ? 'Restore' : 'Minimize'}
            className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 transition hover:text-white"
          >
            {minimized ? '▢' : '—'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMaximized((value) => !value);
              setMinimized(false);
            }}
            title={maximized ? 'Restore size' : 'Maximize'}
            className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 transition hover:text-white"
          >
            {maximized ? '⤓' : '⤢'}
          </button>
          <button
            type="button"
            onClick={() => leave(onClose)}
            aria-label="Close window"
            className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 transition hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className={`scroll-thin min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-white/10 bg-black/40 px-3 py-2">
              {footer}
            </div>
          )}
        </>
      )}
    </section>
  );
}
