import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_INFO_CHANNEL,
  CHECK_FOR_UPDATES_CHANNEL,
  CHOOSE_LIBRARY_TO_OPEN_CHANNEL,
  CHOOSE_LIBRARY_TO_SAVE_CHANNEL,
  CHOOSE_SHOW_TO_OPEN_CHANNEL,
  CHOOSE_SHOW_TO_SAVE_CHANNEL,
  CHOOSE_VENUE_TO_OPEN_CHANNEL,
  CHOOSE_VENUE_TO_SAVE_CHANNEL,
  ENGINE_DOWN_CHANNEL,
  ENGINE_IS_DOWN_CHANNEL,
  ENGINE_PORT_CHANNEL,
  ENGINE_RESTARTED_CHANNEL,
  OPEN_EXAMPLE_CHANNEL,
  OPEN_LICENSE_CHANNEL,
  OPEN_RELEASE_PAGE_CHANNEL,
  SAVE_BEFORE_CLOSE_CHANNEL,
  SAVE_FROM_SNAPSHOT_CHANNEL,
  SAVED_BEFORE_CLOSE_CHANNEL,
  SET_UPDATE_ENABLED_CHANNEL,
  SHOW_LIBRARY_BACKUP_CHANNEL,
  UNSAVED_CHANNEL,
  UPDATE_AVAILABLE_CHANNEL,
  UPDATE_ENABLED_CHANNEL,
  type CloseGuardBridge,
  type DiagnosticsBridge,
  type DialogBridge,
  type EngineBridge,
  type EngineCommand,
  type EngineEvent,
  type EngineRecoveryBridge,
  type LicensesBridge,
  type UpdatesBridge,
} from '../shared/protocol';

type Handler = (...args: unknown[]) => void;

const ipcRenderer = {
  handlers: new Map<string, Handler[]>(),
  on: vi.fn((channel: string, handler: Handler) => {
    ipcRenderer.handlers.set(channel, [...(ipcRenderer.handlers.get(channel) ?? []), handler]);
  }),
  removeListener: vi.fn((channel: string, handler: Handler) => {
    ipcRenderer.handlers.set(
      channel,
      (ipcRenderer.handlers.get(channel) ?? []).filter((h) => h !== handler),
    );
  }),
  invoke: vi.fn(async () => 'invoked'),
  send: vi.fn(),
};
const exposed = new Map<string, unknown>();

vi.mock('electron', () => ({
  ipcRenderer,
  contextBridge: { exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api) },
}));

// A fresh preload per test: its port and queue are module state.
async function load() {
  vi.resetModules();
  await import('./index');
  return {
    engine: exposed.get('engine') as EngineBridge,
    recovery: exposed.get('engineRecovery') as EngineRecoveryBridge,
    dialogs: exposed.get('dialogs') as DialogBridge,
    closeGuard: exposed.get('closeGuard') as CloseGuardBridge,
    updates: exposed.get('updates') as UpdatesBridge,
    diagnostics: exposed.get('diagnostics') as DiagnosticsBridge,
    licenses: exposed.get('licenses') as LicensesBridge,
  };
}

const fire = (channel: string, ...args: unknown[]) =>
  ipcRenderer.handlers.get(channel)?.forEach((handler) => handler({}, ...args));

function fakePort() {
  return { postMessage: vi.fn(), onmessage: null as ((m: unknown) => void) | null };
}

const command = (type: string, more: object = {}) =>
  ({ type, ...more }) as unknown as EngineCommand;

beforeEach(() => {
  ipcRenderer.handlers.clear();
  exposed.clear();
  vi.clearAllMocks();
});

describe('engine bridge', () => {
  it('exposes every bridge', async () => {
    await load();
    expect([...exposed.keys()].sort()).toEqual([
      'closeGuard',
      'diagnostics',
      'dialogs',
      'engine',
      'engineRecovery',
      'licenses',
      'updates',
    ]);
  });

  it('queues commands until the port arrives, then flushes them in order', async () => {
    const { engine } = await load();
    engine.send(command('a'));
    engine.send(command('b'));
    const port = fakePort();
    // The port rides on the event itself.
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [port] });
    expect(port.postMessage.mock.calls.map((c) => (c[0] as EngineCommand).type)).toEqual([
      'a',
      'b',
    ]);
    engine.send(command('c'));
    expect(port.postMessage).toHaveBeenLastCalledWith(command('c'));
  });

  it('ignores an event without a port', async () => {
    const { engine } = await load();
    engine.send(command('a'));
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [] });
    const port = fakePort();
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [port] });
    expect(port.postMessage).toHaveBeenCalledOnce();
  });

  it('delivers engine events to listeners until they unsubscribe', async () => {
    const { engine } = await load();
    const port = fakePort();
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [port] });
    const seen = vi.fn();
    const off = engine.onEvent(seen);
    const event = { type: 'pong' } as unknown as EngineEvent;
    port.onmessage!({ data: event });
    expect(seen).toHaveBeenCalledWith(event);
    off();
    port.onmessage!({ data: event });
    expect(seen).toHaveBeenCalledOnce();
  });

  it('re-sends the state requests to a restarted engine', async () => {
    const { engine } = await load();
    const first = fakePort();
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [first] });
    engine.send(command('getShow'));
    const second = fakePort();
    ipcRenderer.handlers.get(ENGINE_PORT_CHANNEL)![0]!({ ports: [second] });
    expect(second.postMessage).toHaveBeenCalledWith(command('getShow'));
  });
});

describe('engine recovery', () => {
  it('relays restarts and down, and unsubscribes', async () => {
    const { recovery } = await load();
    const restarted = vi.fn();
    const down = vi.fn();
    const offRestarted = recovery.onRestarted(restarted);
    const offDown = recovery.onDown(down);
    fire(ENGINE_RESTARTED_CHANNEL, 'restored');
    fire(ENGINE_DOWN_CHANNEL);
    expect(restarted).toHaveBeenCalledWith('restored');
    expect(down).toHaveBeenCalledOnce();
    offRestarted();
    offDown();
    fire(ENGINE_RESTARTED_CHANNEL, 'empty');
    fire(ENGINE_DOWN_CHANNEL);
    expect(restarted).toHaveBeenCalledOnce();
    expect(down).toHaveBeenCalledOnce();
  });

  it('asks main whether the engine is down and saves from the snapshot', async () => {
    const { recovery } = await load();
    await recovery.isDown();
    await recovery.saveFromSnapshot('show');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(ENGINE_IS_DOWN_CHANNEL);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(SAVE_FROM_SNAPSHOT_CHANNEL, 'show');
  });
});

describe('dialogs', () => {
  it('invokes the matching channel with its arguments', async () => {
    const { dialogs } = await load();
    await dialogs.chooseVenueToOpen('f');
    await dialogs.chooseVenueToSave('cur', 'f');
    await dialogs.chooseShowToOpen('f');
    await dialogs.chooseShowToSave('cur', 'f');
    await dialogs.chooseLibraryToOpen('f');
    await dialogs.chooseLibraryToSave('name', 'f');
    await dialogs.openExample();
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [CHOOSE_VENUE_TO_OPEN_CHANNEL, 'f'],
      [CHOOSE_VENUE_TO_SAVE_CHANNEL, 'cur', 'f'],
      [CHOOSE_SHOW_TO_OPEN_CHANNEL, 'f'],
      [CHOOSE_SHOW_TO_SAVE_CHANNEL, 'cur', 'f'],
      [CHOOSE_LIBRARY_TO_OPEN_CHANNEL, 'f'],
      [CHOOSE_LIBRARY_TO_SAVE_CHANNEL, undefined, 'f', 'name'],
      [OPEN_EXAMPLE_CHANNEL],
    ]);
  });

  it('reveals a library backup', async () => {
    const { dialogs } = await load();
    dialogs.showLibraryBackup('C:\\b.json');
    expect(ipcRenderer.send).toHaveBeenCalledWith(SHOW_LIBRARY_BACKUP_CHANNEL, 'C:\\b.json');
  });
});

describe('close guard', () => {
  it('reports unsaved state', async () => {
    const { closeGuard } = await load();
    closeGuard.setUnsaved('show', true);
    expect(ipcRenderer.send).toHaveBeenCalledWith(UNSAVED_CHANNEL, 'show', true);
  });

  it('saves when asked for its own document and reports the result', async () => {
    const { closeGuard } = await load();
    const save = vi.fn(async () => true);
    closeGuard.onSaveBeforeClose('show', save);
    fire(SAVE_BEFORE_CLOSE_CHANNEL, 'venue');
    expect(save).not.toHaveBeenCalled();
    fire(SAVE_BEFORE_CLOSE_CHANNEL, 'show');
    await vi.waitFor(() =>
      expect(ipcRenderer.send).toHaveBeenCalledWith(SAVED_BEFORE_CLOSE_CHANNEL, 'show', true),
    );
  });

  it('reports a failed save as not saved, and unsubscribes', async () => {
    const { closeGuard } = await load();
    const off = closeGuard.onSaveBeforeClose('venue', async () => {
      throw new Error('disk full');
    });
    fire(SAVE_BEFORE_CLOSE_CHANNEL, 'venue');
    await vi.waitFor(() =>
      expect(ipcRenderer.send).toHaveBeenCalledWith(SAVED_BEFORE_CLOSE_CHANNEL, 'venue', false),
    );
    off();
    expect(ipcRenderer.handlers.get(SAVE_BEFORE_CLOSE_CHANNEL)).toEqual([]);
  });
});

describe('updates, diagnostics and licenses', () => {
  it('maps each call to its channel', async () => {
    const { updates, diagnostics, licenses } = await load();
    await updates.available();
    await updates.enabled();
    await updates.checkNow();
    updates.setEnabled(false);
    updates.openReleasePage('https://example.test');
    await diagnostics.appInfo();
    await licenses.open('LICENSE.txt' as never);
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [UPDATE_AVAILABLE_CHANNEL],
      [UPDATE_ENABLED_CHANNEL],
      [CHECK_FOR_UPDATES_CHANNEL],
      [APP_INFO_CHANNEL],
      [OPEN_LICENSE_CHANNEL, 'LICENSE.txt'],
    ]);
    expect(ipcRenderer.send.mock.calls).toEqual([
      [SET_UPDATE_ENABLED_CHANNEL, false],
      [OPEN_RELEASE_PAGE_CHANNEL, 'https://example.test'],
    ]);
  });
});
