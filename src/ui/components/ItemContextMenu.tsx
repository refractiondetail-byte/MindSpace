import { useEffect, useRef, type ReactElement } from 'react';
import { targetKindLabel, targetPath } from '../../lib/solar';
import type { ItemContextMenuState } from '../hooks/useItemContextMenu';
import { TrashIcon } from './SolarGlyphs';

export type ItemContextAction = 'ask' | 'move' | 'ai-move' | 'delete';

interface ActionDef {
  id: ItemContextAction;
  label: string;
  hint: string;
  icon: ReactElement;
  danger?: boolean;
}

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 7.5h5l1.5 2h9.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M14 4h5v5M19 4l-6 6" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 20 10.5-10.5M14 3l.8 2.2L17 6l-2.2.8L14 9l-.8-2.2L11 6l2.2-.8ZM19.5 12l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z" />
    </svg>
  );
}

/**
 * Floating OLED menu shared by every Star, Planet and Moon in both views.
 * Four actions only, each with a one-line hint so the outcome is obvious.
 */
export function ItemContextMenu({
  state,
  onAction,
  onClose,
}: {
  state: ItemContextMenuState;
  onAction: (action: ItemContextAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const target = state.target;
  const count = target.items.length;
  const where =
    target.kind === 'star'
      ? `${count} moon${count === 1 ? '' : 's'}`
      : target.kind === 'planet'
        ? `${target.star} · ${count} moon${count === 1 ? '' : 's'}`
        : `${target.star} › ${target.planet ?? 'General'}`;

  const actions: ActionDef[] = [
    {
      id: 'ask',
      label: 'Ask AI About This',
      hint: 'Open chat grounded in this item',
      icon: <SparkIcon />,
    },
    {
      id: 'move',
      label: 'Move Manually',
      hint: 'Pick a star → planet destination',
      icon: <MoveIcon />,
    },
    {
      id: 'ai-move',
      label: 'Ask AI to Move / Organize',
      hint: 'Describe where it should go',
      icon: <WandIcon />,
    },
    {
      id: 'delete',
      label: 'Delete',
      hint: count > 1 ? `Also removes ${count} nested moons` : 'Remove from both views',
      icon: <TrashIcon className="h-3.5 w-3.5" />,
      danger: true,
    },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${target.title}`}
      className="context-menu fixed z-[90] w-[16.5rem] overflow-hidden rounded-xl border border-[#1A1A1A] bg-[#050505] p-1 shadow-[0_28px_70px_-24px_rgba(0,0,0,1)]"
      style={{ left: state.x, top: state.y }}
    >
      <div className="border-b border-[#1A1A1A] px-2.5 pb-2 pt-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          {targetKindLabel(target.kind)}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-zinc-100">{target.title}</p>
        <p className="truncate text-[9px] text-zinc-500" title={targetPath(target)}>
          {where}
        </p>
      </div>

      <div className="pt-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onClick={() => onAction(action.id)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
              action.danger
                ? 'text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200'
                : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                action.danger
                  ? 'border-rose-500/20 bg-rose-500/5'
                  : 'border-[#1A1A1A] bg-white/[0.03]'
              }`}
            >
              {action.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium">{action.label}</span>
              <span className="block truncate text-[9px] text-zinc-500">{action.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
