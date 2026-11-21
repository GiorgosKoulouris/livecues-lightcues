export interface DetachedVisualiserOptions<W> {
  // Opens the Detached Visualiser's window. `onClosed` must run when it closes,
  // whoever closed it.
  open: (onClosed: () => void) => W;
  focus: (window: W) => void;
  close: (window: W) => void;
  // The Visualiser went to, or came back from, its own window.
  changed: (detached: boolean) => void;
}

// Whether the Visualiser is detached (ADR 0022): at most one window.
// Electron-free, so it is unit-testable.
export function createDetachedVisualiser<W>({
  open,
  focus,
  close,
  changed,
}: DetachedVisualiserOptions<W>) {
  let current: W | undefined;

  return {
    isDetached: (): boolean => current !== undefined,
    // A second detach brings the open window forward.
    detach: (): void => {
      if (current !== undefined) return focus(current);
      const window = open(() => {
        if (current !== window) return;
        current = undefined;
        changed(false);
      });
      current = window;
      changed(true);
    },
    // Closing the window is reattaching.
    reattach: (): void => {
      if (current !== undefined) close(current);
    },
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// `size` centred in a display's work area, cut down to fit it.
export function centredBounds(workArea: Rect, size: { width: number; height: number }): Rect {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}
