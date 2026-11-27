import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type { SolarTarget } from '../../lib/solar';

export interface ItemContextMenuState {
  target: SolarTarget;
  x: number;
  y: number;
}

/** Handlers spread onto a Star, Planet or Moon surface in either view. */
export interface ItemContextHandlers {
  onContextMenu: (event: ReactMouseEvent) => void;
  onTouchStart: (event: ReactTouchEvent) => void;
  onTouchMove: (event: ReactTouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  /** Stops the synthetic click that follows a long-press from drilling down. */
  onClickCapture: (event: ReactMouseEvent) => void;
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 12;
const MENU_WIDTH = 264;
const MENU_HEIGHT = 286;
const EDGE = 10;

/**
 * One menu implementation for desktop right-click and mobile press-and-hold.
 * The same `bind` output is spread over every item in the file system, and the
 * imperative `open` is used by the 3D meshes where no DOM handlers exist.
 */
export function useItemContextMenu() {
  const [menu, setMenu] = useState<ItemContextMenuState | null>(null);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const open = useCallback((target: SolarTarget, x: number, y: number) => {
    clearTimer();
    setMenu({
      target,
      x: Math.max(EDGE, Math.min(x, window.innerWidth - MENU_WIDTH - EDGE)),
      y: Math.max(EDGE, Math.min(y, window.innerHeight - MENU_HEIGHT - EDGE)),
    });
  }, [clearTimer]);

  const close = useCallback(() => setMenu(null), []);

  const bind = useCallback(
    (target: SolarTarget): ItemContextHandlers => ({
      onContextMenu: (event) => {
        clearTimer();
        event.preventDefault();
        event.stopPropagation();
        firedRef.current = false;
        open(target, event.clientX, event.clientY);
      },
      onTouchStart: (event) => {
        if (event.touches.length !== 1) {
          clearTimer();
          return;
        }
        const touch = event.touches[0];
        originRef.current = { x: touch.clientX, y: touch.clientY };
        firedRef.current = false;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          firedRef.current = true;
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate?.(12);
          }
          open(target, touch.clientX, touch.clientY);
        }, LONG_PRESS_MS);
      },
      onTouchMove: (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const distance = Math.hypot(
          touch.clientX - originRef.current.x,
          touch.clientY - originRef.current.y,
        );
        if (distance > MOVE_TOLERANCE) clearTimer();
      },
      onTouchEnd: clearTimer,
      onTouchCancel: clearTimer,
      onClickCapture: (event) => {
        if (!firedRef.current) return;
        firedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [clearTimer, open],
  );

  return { menu, bind, close, open };
}
