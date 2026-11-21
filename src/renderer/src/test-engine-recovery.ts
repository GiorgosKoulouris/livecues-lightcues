// A fake `window.engineRecovery` for component tests: a test tells it the
// engine restarted or is down, as main does.
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { EngineRecoveryBridge, RestoreResult } from '../../shared/protocol';

export function installFakeEngineRecovery() {
  const restarted = new Set<(result: RestoreResult) => void>();
  const down = new Set<() => void>();
  const bridge = {
    onRestarted: (listener: (result: RestoreResult) => void) => {
      restarted.add(listener);
      return () => void restarted.delete(listener);
    },
    onDown: (listener: () => void) => {
      down.add(listener);
      return () => void down.delete(listener);
    },
    isDown: vi.fn(async () => false),
    saveFromSnapshot: vi.fn<EngineRecoveryBridge['saveFromSnapshot']>(async () => undefined),
  };
  vi.stubGlobal('engineRecovery', bridge);
  return {
    bridge,
    restart: (result: RestoreResult) => act(() => restarted.forEach((l) => l(result))),
    down: () => act(() => down.forEach((l) => l())),
  };
}

export type FakeEngineRecovery = ReturnType<typeof installFakeEngineRecovery>;
