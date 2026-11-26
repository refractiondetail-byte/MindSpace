import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getAttachmentBlob } from '../../core/repository';
import type { Attachment } from '../../core/types';

interface TextViewerProps {
  attachment: Attachment;
  onClose: () => void;
  onFocus?: () => void;
}

export function TextViewer({ attachment, onClose, onFocus }: TextViewerProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [pos, setPos] = useState({ x: 120, y: 120 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const zIndexRef = useRef(51);
  const [zIndex, setZIndex] = useState(51);

  function bringToFront() {
    zIndexRef.current += 1;
    setZIndex(zIndexRef.current);
    onFocus?.();
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const blob = await getAttachmentBlob(attachment.id);
      const content = blob ? await blob.text() : '';
      if (active) {
        setText(content);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attachment.id]);

  function handleTitlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (maximized) return;
    event.preventDefault();
    bringToFront();
    setDragging(true);
    dragOffset.current = { x: event.clientX - pos.x, y: event.clientY - pos.y };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }

  function handleTitlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || maximized) return;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 80, event.clientX - dragOffset.current.x)),
      y: Math.max(8, Math.min(window.innerHeight - 60, event.clientY - dragOffset.current.y)),
    });
  }

  function handleTitlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className={`pointer-events-auto fixed flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0d12] shadow-2xl ${
        maximized ? 'inset-4' : ''
      }`}
      style={maximized ? { zIndex } : { left: pos.x, top: pos.y, width: 640, height: 420, zIndex }}
      onPointerDown={bringToFront}
    >
      <div
        className="flex cursor-move touch-none select-none items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2"
        style={{ touchAction: 'none' }}
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        onPointerCancel={handleTitlePointerUp}
      >
        <div className="pointer-events-none min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200">{attachment.name}</p>
        </div>
        <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
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

      {!minimized && (
        <div className="flex-1 overflow-auto bg-black/40 p-4">
          {loading ? (
            <p className="text-[11px] text-slate-500">Loading…</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
