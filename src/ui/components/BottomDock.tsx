interface BottomDockProps {
  onRecenter: () => void;
  onToggleMode: () => void;
}

export function BottomDock({
  onRecenter,
  onToggleMode,
}: BottomDockProps) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-1.5 py-1 backdrop-blur shadow-lg">
      <button
        type="button"
        onClick={onRecenter}
        className="hud-chip"
        title="Recenter view"
        aria-label="Recenter view"
      >
        ⌖
      </button>
      <button
        type="button"
        onClick={onToggleMode}
        className="hud-chip"
        title="Toggle Home / Pages"
        aria-label="Toggle Home and Pages views"
      >
        ◔
      </button>
    </div>
  );
}
