import type { CSSProperties } from 'react';

/** Glowing four-point star used as the Star folder glyph. */
export function StarGlyph({ color, size = 32 }: { color: string; size?: number }) {
  const glow: CSSProperties = { filter: `drop-shadow(0 0 5px ${color}99)` };
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 rounded-full opacity-60 blur-[6px]"
        style={{ background: `radial-gradient(circle, ${color}88 0%, transparent 70%)` }}
      />
      <svg viewBox="0 0 24 24" width={size} height={size} className="relative" style={glow}>
        <path
          d="M12 1.6 14.3 9.7 22.4 12 14.3 14.3 12 22.4 9.7 14.3 1.6 12 9.7 9.7Z"
          fill={color}
        />
        <circle cx="12" cy="12" r="1.8" fill="#ffffff" opacity="0.88" />
      </svg>
    </span>
  );
}

export function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
    </svg>
  );
}

export function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
