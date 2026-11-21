// A fake `window.visualiserWindow` for component tests. Like main, it says
// every listener when the Visualiser is detached or reattached.
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { VisualiserWindowBridge } from '../../shared/protocol';
import type { VisualiserHandover } from '../../shared/visualiser-handover';

// A pending answer the test settles itself.
export interface Deferred<T> {
  resolve(value: T): Promise<void>;
  reject(error: Error): Promise<void>;
}

export interface FakeVisualiserWindow {
  detach: ReturnType<typeof vi.fn>;
  reattach: ReturnType<typeof vi.fn>;
  // The state main holds: what the last Visualiser sent.
  setState: ReturnType<typeof vi.fn>;
  held: VisualiserHandover | undefined;
  // Main says the Visualiser is, or is no longer, in its own window.
  set(detached: boolean): void;
  // The next isDetached or getState call stays pending until the test settles it.
  deferNext(call: 'isDetached'): Deferred<boolean>;
  deferNext(call: 'getState'): Deferred<VisualiserHandover | undefined>;
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
  const deferred: {
    isDetached?: Promise<boolean>;
    getState?: Promise<VisualiserHandover | undefined>;
  } = {};
  const deferNext = (call: 'isDetached' | 'getState') => {
    let resolve!: (value: never) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<never>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // A rejection the test settles later is handled by the code under test.
    promise.catch(() => undefined);
    (deferred as Record<string, Promise<unknown>>)[call] = promise;
    // Settling lets the code under test's continuations run.
    const flush = () => act(async () => {});
    return {
      resolve: async (value: never) => (resolve(value), flush()),
      reject: async (error: Error) => (reject(error), flush()),
    };
  };
  const take = <T>(call: 'isDetached' | 'getState'): Promise<T> | undefined => {
    const pending = deferred[call] as Promise<T> | undefined;
    delete deferred[call];
    return pending;
  };
  const fake = {
    deferNext: deferNext as FakeVisualiserWindow['deferNext'],
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
    isDetached: () => take<boolean>('isDetached') ?? Promise.resolve(isDetached),
    setState,
    getState: () => take<VisualiserHandover | undefined>('getState') ?? Promise.resolve(held),
    onDetached(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  vi.stubGlobal('visualiserWindow', bridge);
  return fake;
}
