// A fake `window.visualiserWindow` for component tests. Like main, it says
// every listener when the Visualiser is detached or reattached.
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { VisualiserWindowBridge } from '../../shared/protocol';
import type { VisualiserHandover } from '../../shared/visualiser-handover';

export interface FakeVisualiserWindow {
  detach: ReturnType<typeof vi.fn>;
  reattach: ReturnType<typeof vi.fn>;
  // The state main holds: what the last Visualiser sent.
  setState: ReturnType<typeof vi.fn>;
  held: VisualiserHandover | undefined;
  // Main says the Visualiser is, or is no longer, in its own window.
  set(detached: boolean): void;
}

export function installFakeVisualiserWindow(detached = false): FakeVisualiserWindow {
  let isDetached = detached;
  let held: VisualiserHandover | undefined;
  const listeners = new Set<(detached: boolean) => void>();
  const set = (value: boolean) => {
    isDetached = value;
    act(() => listeners.forEach((listener) => listener(value)));
  };
  const setState = vi.fn((state: VisualiserHandover) => {
    held = state;
  });
  const fake = {
    setState,
    get held() {
      return held;
    },
    set held(value: VisualiserHandover | undefined) {
      held = value;
    },
    detach: vi.fn(() => set(true)),
    reattach: vi.fn(() => set(false)),
    set,
  };
  const bridge: VisualiserWindowBridge = {
    detach: fake.detach,
    reattach: fake.reattach,
    isDetached: async () => isDetached,
    setState,
    getState: async () => held,
    onDetached(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  vi.stubGlobal('visualiserWindow', bridge);
  return fake;
}
