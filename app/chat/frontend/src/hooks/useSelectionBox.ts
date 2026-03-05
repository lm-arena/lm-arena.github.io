import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Model } from '../types';

type SelectionPoint = { x: number; y: number };

interface SelectionState {
  origin: SelectionPoint;
  current: SelectionPoint;
  active: boolean;
}

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type ClickSuppressRef = React.MutableRefObject<{ card: boolean; background: boolean }>;

interface UseSelectionBoxParams {
  rootContainerRef: React.RefObject<HTMLDivElement>;
  visualizationAreaRef: React.RefObject<HTMLDivElement>;
  arenaOffsetYRef: React.MutableRefObject<number>;
  arenaTargetYRef: React.MutableRefObject<number>;
  wheelRafRef: React.MutableRefObject<number | null>;
  selectedModels: Model[];
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  selectedCardIds: Set<string>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  suppressClickRef: ClickSuppressRef;
  dragSelectionActiveRef: React.MutableRefObject<boolean>;
}

function normalizeRect(a: SelectionPoint, b: SelectionPoint) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function useSelectionBox({
  rootContainerRef,
  visualizationAreaRef,
  arenaOffsetYRef,
  arenaTargetYRef,
  wheelRafRef,
  selectedModels,
  cardRefs,
  selectedCardIds,
  setSelectedCardIds,
  suppressClickRef,
  dragSelectionActiveRef,
}: UseSelectionBoxParams) {
  const [dragSelection, setDragSelection] = useState<SelectionState | null>(null);

  useEffect(() => {
    dragSelectionActiveRef.current = dragSelection != null;
  }, [dragSelection, dragSelectionActiveRef]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!rootContainerRef.current) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const clickedOnCard = target.closest('[data-card]');
      const clickedOnInteractive = target.closest('button, a, input, textarea, select, [role="button"]');
      const clickedOnDraggable = target.closest('[draggable]');
      const clickedInNoSelectArea = target.closest('[data-no-arena-scroll]');
      if (clickedOnCard || clickedOnInteractive || clickedOnDraggable || clickedInNoSelectArea) return;

      if (!rootContainerRef.current.contains(target)) return;

      arenaTargetYRef.current = arenaOffsetYRef.current;
      if (wheelRafRef.current != null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }

      const rootBounds = rootContainerRef.current.getBoundingClientRect();
      const point: SelectionPoint = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top,
      };

      event.preventDefault();

      dragSelectionActiveRef.current = true;
      suppressClickRef.current.card = false;
      suppressClickRef.current.background = false;
      setDragSelection({
        origin: point,
        current: point,
        active: false,
      });
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, [
    arenaOffsetYRef,
    arenaTargetYRef,
    wheelRafRef,
    rootContainerRef,
    visualizationAreaRef,
    suppressClickRef,
  ]);

  useEffect(() => {
    if (!dragSelection || !rootContainerRef.current) return;

    const handleSelectStart = (event: Event) => event.preventDefault();
    document.addEventListener('selectstart', handleSelectStart);

    const handleMouseMove = (event: MouseEvent) => {
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point: SelectionPoint = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top,
      };

      setDragSelection((state) => {
        if (!state) return state;
        const rect = normalizeRect(state.origin, point);
        const active = state.active || rect.width > 4 || rect.height > 4;
        return { ...state, current: point, active };
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      dragSelectionActiveRef.current = false;
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point: SelectionPoint = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top,
      };

      const upTarget = event.target as HTMLElement | null;
      const willTriggerCardClick = Boolean(upTarget && upTarget.closest('[data-card]'));

      setDragSelection((state) => {
        if (!state) return null;

        const rect = normalizeRect(state.origin, point);

        if (state.active && rect.width > 0 && rect.height > 0) {
          const matched: string[] = [];
          const currentRootBounds = rootContainerRef.current!.getBoundingClientRect();
          const selectionRectScreen = {
            left: currentRootBounds.left + rect.left,
            right: currentRootBounds.left + rect.right,
            top: currentRootBounds.top + rect.top,
            bottom: currentRootBounds.top + rect.bottom,
          };

          for (const model of selectedModels) {
            const cardElement = cardRefs.current.get(model.id);
            if (!cardElement) continue;

            const cardBounds = cardElement.getBoundingClientRect();
            const intersects = !(
              cardBounds.right < selectionRectScreen.left ||
              cardBounds.left > selectionRectScreen.right ||
              cardBounds.bottom < selectionRectScreen.top ||
              cardBounds.top > selectionRectScreen.bottom
            );

            if (intersects) matched.push(model.id);
          }

          setSelectedCardIds(new Set(matched));
          // Don't auto-open inspector - user must press Enter or use context menu
          if (willTriggerCardClick) {
            suppressClickRef.current.card = true;
          } else if (matched.length > 0) {
            suppressClickRef.current.background = true;
          }
        }

        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', handleSelectStart);
    };
  }, [
    dragSelection,
    rootContainerRef,
    visualizationAreaRef,
    selectedModels,
    cardRefs,
    selectedCardIds,
    setSelectedCardIds,
    suppressClickRef,
  ]);

  const selectionRect: SelectionRect | null = useMemo(() => {
    if (!dragSelection || !dragSelection.active) return null;
    const rect = normalizeRect(dragSelection.origin, dragSelection.current);
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, [dragSelection]);

  const clearSelection = useCallback(() => {
    setDragSelection(null);
    dragSelectionActiveRef.current = false;
  }, [dragSelectionActiveRef]);

  return {
    selectionRect,
    isSelecting: dragSelection != null,
    clearSelection,
  };
}
