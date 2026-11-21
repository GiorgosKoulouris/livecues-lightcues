import type {
  EngineCommand,
  EngineConnect,
  EngineEvent,
  EngineGrantPath,
  EnginePathGranted,
  EngineRestore,
  EngineRestored,
  EngineSnapshot,
  EngineSnapshotMessage,
  RestoreResult,
  UiClient,
} from '../shared/protocol';
import { createEngine, type EngineOptions } from './engine';

// Structural stand-ins for Electron's MessagePortMain and utilityProcess
// parentPort, so the engine never imports Electron.
export interface PortLike {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  // The other end closed, e.g. its window is gone.
  on(event: 'close', listener: () => void): void;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

export interface ParentPortLike {
  on(event: 'message', listener: (e: { data: unknown; ports: PortLike[] }) => void): void;
  postMessage(message: unknown): void;
}

function isConnect(data: unknown): data is EngineConnect {
  const connect = data as EngineConnect | undefined;
  return (
    connect?.type === 'connect' && (connect.client === 'main' || connect.client === 'visualiser')
  );
}

// A reply to one client's request, not a broadcast.
function isReply(event: EngineEvent): boolean {
  return 'requestId' in event || event.type === 'pong';
}

// Anything else from the UI port is dropped before it reaches the engine.
function isCommand(data: unknown): data is EngineCommand {
  return typeof (data as { type?: unknown } | undefined)?.type === 'string';
}

function isGrantPath(data: unknown): data is EngineGrantPath {
  const grant = data as EngineGrantPath | undefined;
  return grant?.type === 'grantPath' && typeof grant.path === 'string';
}

function isRestore(data: unknown): data is EngineRestore {
  const restore = data as EngineRestore | undefined;
  return restore?.type === 'restore' && typeof restore.snapshot === 'object';
}

// Runs the engine behind a parent port. The parent hands over a UI port with
// each `connect` message, naming its client. Events go to every connected
// client; a reply to a request goes to the client that sent it. A newer UI
// port for a client (e.g. after a window reload) replaces and closes that
// client's previous one. The parent also grants the paths the
// user picked, and each grant is acked on the parent port. The engine sends
// its snapshot to the parent, whole on start and then as it changes, and
// restores one the parent sends after a restart (ADR 0011). The preview and
// channel monitor stop for a client whose UI port closes or is replaced. A command that throws
// is logged; it must not end the engine, or DMX output stops.
export function serve(
  parentPort: ParentPortLike,
  options: Omit<EngineOptions, 'emit' | 'report'> = {},
): void {
  const uiPorts = new Map<UiClient, PortLike>();
  // The client whose command the engine is handling now. Commands are handled
  // synchronously, so replies made meanwhile are for it.
  let requester: UiClient | undefined;
  const sendSnapshot = (part: Partial<EngineSnapshot>) => {
    const message: EngineSnapshotMessage = { type: 'snapshot', ...part };
    parentPort.postMessage(message);
  };
  const engine = createEngine({
    ...options,
    emit: (event) => {
      if (requester && isReply(event)) uiPorts.get(requester)?.postMessage(event);
      else for (const port of uiPorts.values()) port.postMessage(event);
    },
    report: sendSnapshot,
  });
  sendSnapshot(engine.snapshot());

  // A restore that throws even on its last fallback must not end the engine
  // either.
  function restore(snapshot: EngineSnapshot): RestoreResult {
    try {
      return engine.restore(snapshot);
    } catch (error) {
      console.error('Engine restore failed.', error);
      return 'empty';
    }
  }

  parentPort.on('message', ({ data, ports }) => {
    if (isRestore(data)) {
      const restored: EngineRestored = { type: 'restored', result: restore(data.snapshot) };
      parentPort.postMessage(restored);
      // Whole again, since the parent ignores parts sent while restoring.
      sendSnapshot(engine.snapshot());
      return;
    }
    if (isGrantPath(data)) {
      engine.grantPath(data.path);
      const granted: EnginePathGranted = { type: 'pathGranted', path: data.path };
      parentPort.postMessage(granted);
      return;
    }
    const port = ports[0];
    if (!isConnect(data) || !port) return;
    const { client } = data;
    const previous = uiPorts.get(client);
    if (previous) {
      uiPorts.delete(client);
      previous.close();
      engine.clientGone(client);
    }
    uiPorts.set(client, port);
    port.on('close', () => {
      if (uiPorts.get(client) !== port) return;
      uiPorts.delete(client);
      engine.clientGone(client);
    });
    port.on('message', ({ data }) => {
      if (!isCommand(data)) return;
      requester = client;
      try {
        engine.handle(data, client);
      } catch (error) {
        console.error(`Engine command ${data.type} failed.`, error);
      } finally {
        requester = undefined;
      }
    });
    port.start();
  });
}
