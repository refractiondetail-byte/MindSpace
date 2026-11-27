export type WorkspaceView = 'galaxy' | 'files';

interface ViewSwitcherProps {
  value: WorkspaceView;
  onChange: (value: WorkspaceView) => void;
}

function GalaxyIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="2.1" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-24 12 12)" />
      <circle cx="17.6" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 6.5h5l1.6 2h10.4v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M3.5 11.5h17" opacity="0.55" />
    </svg>
  );
}

/** Persistent segmented control in the top header bar. */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const base =
    'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors duration-150 sm:px-2.5 sm:text-[11px]';
  const active = 'bg-[#181818] text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';
  const idle = 'text-zinc-500 hover:text-zinc-200';

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-[#1A1A1A] bg-[#040404] p-0.5"
      role="group"
      aria-label="Workspace view"
    >
      <button
        type="button"
        onClick={() => onChange('galaxy')}
        aria-pressed={value === 'galaxy'}
        className={`${base} ${value === 'galaxy' ? active : idle}`}
      >
        <GalaxyIcon className="h-3.5 w-3.5" />
        <span>Graphical Galaxy</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('files')}
        aria-pressed={value === 'files'}
        className={`${base} ${value === 'files' ? active : idle}`}
      >
        <FolderIcon className="h-3.5 w-3.5" />
        <span>File System</span>
      </button>
    </div>
  );
}
