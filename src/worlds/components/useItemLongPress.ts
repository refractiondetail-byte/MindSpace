import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

const LONG_PRESS_MS = 500;

export interface MeshLongPressHandlers {
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave: (event: ThreeEvent<PointerEvent>) => void;
  /** True once when the following click was produced by a long-press. */
  consumeClick: () => boolean;
}

/**
 * Press-and-hold support for meshes on touch screens. R3F has no DOM long-press
 * event, so this starts a timer on pointer-down and swallows the click that the
 * browser emits afterwards, keeping camera drill-down and context menus apart.
 */
export function useItemLongPress(
  onLongPress: (x: number, y: number) => void,
): MeshLongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.nativeEvent.pointerType !== 'touch') return;
      const { clientX, clientY } = event.nativeEvent;
      clear();
      firedRef.current = false;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(12);
        }
        onLongPress(clientX, clientY);
      }, LONG_PRESS_MS);
    },
    [clear, onLongPress],
  );

  const stop = useCallback(() => clear(), [clear]);

  const consumeClick = useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return { onPointerDown, onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop, consumeClick };
}
