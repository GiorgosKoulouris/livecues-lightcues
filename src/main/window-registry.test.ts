import { describe, expect, it } from 'vitest';
import type { UiClient } from '../shared/protocol';
import { createWindowRegistry } from './window-registry';

type Call =
  | { kind: 'port'; window: string; client: UiClient; engine: string }
  | { kind: 'send'; window: string; channel: string; args: unknown[] };

function registry() {
  const calls: Call[] = [];
  const windows = createWindowRegistry<string, string>({
    postPort: (window, client, engine) => void calls.push({ kind: 'port', window, client, engine }),
    send: (window, channel, ...args) => void calls.push({ kind: 'send', window, channel, args }),
  });
  return { windows, calls };
}

describe('createWindowRegistry', () => {
  it('connects one window with its client name', () => {
    const { windows, calls } = registry();
    windows.add('a', 'main');
    windows.add('b', 'detachedVisualiser');

    windows.connect('b', 'engine-1');

    expect(calls).toEqual([
      { kind: 'port', window: 'b', client: 'detachedVisualiser', engine: 'engine-1' },
    ]);
  });

  it('connects every open window to a restarted engine', () => {
    const { windows, calls } = registry();
    windows.add('a', 'main');
    windows.add('b', 'detachedVisualiser');

    windows.connectAll('engine-2');

    expect(calls).toEqual([
      { kind: 'port', window: 'a', client: 'main', engine: 'engine-2' },
      { kind: 'port', window: 'b', client: 'detachedVisualiser', engine: 'engine-2' },
    ]);
  });

  it('sends a notice to every open window', () => {
    const { windows, calls } = registry();
    windows.add('a', 'main');
    windows.add('b', 'detachedVisualiser');

    windows.sendAll('restarted', 'restored');

    expect(calls).toEqual([
      { kind: 'send', window: 'a', channel: 'restarted', args: ['restored'] },
      { kind: 'send', window: 'b', channel: 'restarted', args: ['restored'] },
    ]);
  });

  it('gives a closed window no more ports or notices', () => {
    const { windows, calls } = registry();
    windows.add('a', 'main');
    windows.add('b', 'detachedVisualiser');

    windows.remove('b');
    windows.connectAll('engine-2');
    windows.sendAll('down');
    windows.connect('b', 'engine-2');

    expect(calls.map((c) => c.window)).toEqual(['a', 'a']);
  });
});
