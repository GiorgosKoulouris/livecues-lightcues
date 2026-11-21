import type { UiClient } from '../shared/protocol';

export interface WindowRegistryOptions<W, E> {
  // Gives `window` a new port to `engine`, naming the client it speaks for.
  postPort: (window: W, client: UiClient, engine: E) => void;
  // Sends a notice to the window's renderer.
  send: (window: W, channel: string, ...args: unknown[]) => void;
}

// The open windows, each with its engine client name (ADR 0022). Engine
// restarts and notices reach every one. Electron-free, so it is unit-testable.
export function createWindowRegistry<W, E>({ postPort, send }: WindowRegistryOptions<W, E>) {
  const open = new Map<W, UiClient>();

  return {
    add: (window: W, client: UiClient): void => void open.set(window, client),
    remove: (window: W): void => void open.delete(window),
    // Connects one window, such as after it loads. An unknown window gets nothing.
    connect: (window: W, engine: E): void => {
      const client = open.get(window);
      if (client !== undefined) postPort(window, client, engine);
    },
    // Connects every open window, after an engine restart.
    connectAll: (engine: E): void => {
      for (const [window, client] of open) postPort(window, client, engine);
    },
    sendAll: (channel: string, ...args: unknown[]): void => {
      for (const window of open.keys()) send(window, channel, ...args);
    },
  };
}
