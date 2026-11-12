/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes of Electron's objects, which the module under test uses by shape */
import { EventEmitter } from 'node:events';
import path, { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_INFO_CHANNEL,
  CHECK_FOR_UPDATES_CHANNEL,
  CHOOSE_SHOW_TO_OPEN_CHANNEL,
  CHOOSE_SHOW_TO_SAVE_CHANNEL,
  CHOOSE_VENUE_TO_OPEN_CHANNEL,
  ENGINE_DOWN_CHANNEL,
  ENGINE_IS_DOWN_CHANNEL,
  ENGINE_PORT_CHANNEL,
  ENGINE_RESTARTED_CHANNEL,
  LIBRARY_BACKUPS_FOLDER,
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
} from '../shared/protocol';

// Everything Electron-shaped, hoisted so the mock factory can reach it.
const h = vi.hoisted(() => {
  type Fn = (...args: any[]) => any;
  const state = {
    packaged: false,
    switches: new Set<string>(),
    paths: { appData: 'C:\\AppData', userData: 'C:\\AppData\\LightCues' } as Record<string, string>,
    appListeners: new Map<string, Fn[]>(),
    handlers: new Map<string, Fn>(),
    listeners: new Map<string, Fn[]>(),
    windows: [] as any[],
    engines: [] as any[],
    nextPid: 100,
    pageLoaded: undefined as string | undefined,
  };
  return { state };
});

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  const { state } = h;

  class FakeContents extends EventEmitter {
    postMessage = vi.fn();
    send = vi.fn();
  }
  class FakeWindow extends EventEmitter {
    static fromWebContents = vi.fn((contents: unknown) =>
      state.windows.find((w) => w.webContents === contents),
    );
    webContents = new FakeContents();
    close = vi.fn(() => {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      this.emit('close', event);
      if (!event.defaultPrevented) this.emit('closed');
    });
    loadURL = vi.fn(async (url: string) => void (state.pageLoaded = url));
    constructor(public options: unknown) {
      super();
      state.windows.push(this);
    }
  }
  class FakeEngine extends EventEmitter {
    pid: number | undefined = state.nextPid++;
    stdout = new PassThrough();
    stderr = new PassThrough();
    postMessage = vi.fn();
    constructor(public args: string[]) {
      super();
      state.engines.push(this);
    }
  }
  return {
    app: {
      commandLine: { hasSwitch: (name: string) => state.switches.has(name) },
      setPath: vi.fn((name: string, path: string) => void (state.paths[name] = path)),
      getPath: (name: string) => state.paths[name]!,
      getVersion: () => '1.2.3',
      getAppPath: () => 'C:\\app',
      get isPackaged() {
        return state.packaged;
      },
      whenReady: () => Promise.resolve(),
      on: (event: string, listener: any) =>
        state.appListeners.set(event, [...(state.appListeners.get(event) ?? []), listener]),
      quit: vi.fn(),
    },
    BrowserWindow: FakeWindow,
    MessageChannelMain: class {
      port1 = { id: 1 };
      port2 = { id: 2 };
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      showMessageBoxSync: vi.fn(),
    },
    ipcMain: {
      handle: (channel: string, fn: any) => void state.handlers.set(channel, fn),
      on: (channel: string, fn: any) =>
        state.listeners.set(channel, [...(state.listeners.get(channel) ?? []), fn]),
      removeListener: (channel: string, fn: any) =>
        state.listeners.set(
          channel,
          (state.listeners.get(channel) ?? []).filter((l) => l !== fn),
        ),
    },
    net: { fetch: vi.fn() },
    shell: { showItemInFolder: vi.fn(), openPath: vi.fn(async () => ''), openExternal: vi.fn() },
    utilityProcess: { fork: vi.fn((_path: string, args: string[]) => new FakeEngine(args)) },
  };
});

const logWrite = vi.fn();
vi.mock('./log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./log')>()),
  createLog: () => ({ write: logWrite }),
}));

const check = {
  run: vi.fn(async () => ({ version: '9.9.9' })),
  enabled: vi.fn(() => true),
  checkNow: vi.fn(async () => 'none'),
  setEnabled: vi.fn(),
};
vi.mock('./update-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./update-check')>()),
  createUpdateCheck: vi.fn(() => check),
}));

const diskWrite = vi.fn();
vi.mock('../engine/file-storage', () => ({
  diskShowFiles: { write: (...a: unknown[]) => diskWrite('show', ...a) },
  diskVenueFiles: { write: (...a: unknown[]) => diskWrite('venue', ...a) },
  fileStorage: vi.fn(() => ({})),
}));

vi.mock('./engine-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./engine-snapshot')>()),
  snapshotFile: vi.fn(() => '{"file":true}'),
}));

const existing = vi.hoisted(() => ({ folders: new Set<string>() }));
// Only the folders a test names exist, as far as main can tell. Everything
// else, the coverage provider's files included, still reaches the real disk.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (target: string) => existing.folders.has(target) || actual.existsSync(target),
  };
});

const electron = await import('electron');
const dialog = vi.mocked(electron.dialog);
const shell = vi.mocked(electron.shell);
const { state } = h;

const invoke = (channel: string, ...args: unknown[]) =>
  state.handlers.get(channel)!({ sender: state.windows[0]?.webContents }, ...args);
const send = (channel: string, sender: unknown, ...args: unknown[]) =>
  state.listeners.get(channel)?.forEach((l) => l({ sender }, ...args));

// The options a dialog was called with: the second argument after a parent window.
const optionsOf = (mock: { mock: { calls: unknown[][] } }, call: number): Record<string, any> =>
  mock.mock.calls[call]![1] as Record<string, any>;

const engine = (i = state.engines.length - 1) => state.engines[i]!;
const win = () => state.windows[0]!;

async function boot() {
  vi.resetModules();
  await import('./index');
  // whenReady's callback runs on a microtask.
  await vi.waitFor(() => expect(state.windows).toHaveLength(1));
}

// A whole snapshot, so a restarted engine has something to restore.
function snapshot(eng: EventEmitter) {
  for (const part of ['show', 'venue', 'playback', 'house', 'midiInput']) {
    eng.emit('message', {
      type: 'snapshot',
      [part]: { path: `C:\\x.${part}`, document: {} },
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  state.packaged = false;
  state.switches.clear();
  state.paths = { appData: 'C:\\AppData', userData: 'C:\\AppData\\LightCues' };
  state.appListeners.clear();
  state.handlers.clear();
  state.listeners.clear();
  state.windows.length = 0;
  state.engines.length = 0;
  existing.folders.clear();
  delete process.env['ELECTRON_RENDERER_URL'];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('start up', () => {
  it('moves user data under LiveCues unless the switch is given', async () => {
    await boot();
    expect(electron.app.setPath).toHaveBeenCalledWith(
      'userData',
      join('C:\\AppData', 'LiveCues', 'LightCues'),
    );
    vi.clearAllMocks();
    state.switches.add('user-data-dir');
    state.windows.length = 0;
    await boot();
    expect(electron.app.setPath).not.toHaveBeenCalled();
  });

  it('forks the engine with its file arguments and logs its output', async () => {
    await boot();
    expect(engine().args).toHaveLength(3);
    engine().emit('spawn');
    engine().emit('exit', 0);
    engine().stdout.write('hello\nwor');
    engine().stdout.write('ld\n');
    engine().stderr.write('oops\n');
    engine().stdout.end();
    await vi.waitFor(() => expect(logWrite).toHaveBeenCalledWith('[engine] hello'));
    expect(logWrite).toHaveBeenCalledWith('[engine] world');
    expect(logWrite).toHaveBeenCalledWith('[engine] oops');
    expect(logWrite).toHaveBeenCalledWith(expect.stringContaining('Engine started'));
  });

  it('creates a sandboxed window and loads the built page when packaged', async () => {
    state.packaged = true;
    await boot();
    const { webPreferences, icon } = win().options;
    expect(webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
    expect(icon).toBeUndefined();
    expect(state.pageLoaded).toMatch(/^file:.*index\.html$/);
  });

  it('loads the dev server in development, and sets an icon', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173/';
    await boot();
    expect(state.pageLoaded).toBe('http://localhost:5173/');
    expect(win().options.icon).toMatch(/icon\.ico$/);
  });

  it('quits when every window is closed', async () => {
    await boot();
    state.appListeners.get('window-all-closed')![0]!();
    expect(electron.app.quit).toHaveBeenCalled();
  });

  it('restricts every web contents', async () => {
    await boot();
    const contents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
    state.appListeners.get('web-contents-created')![0]!({}, contents);
    expect(contents.setWindowOpenHandler).toHaveBeenCalled();
  });

  it('logs main errors', async () => {
    await boot();
    process.emit('uncaughtExceptionMonitor', new Error('boom'), 'uncaughtException');
    expect(logWrite).toHaveBeenCalledWith(expect.stringContaining('Main error:'));
    const rejection = Promise.reject(new Error('later'));
    rejection.catch(() => {});
    process.emit('unhandledRejection', new Error('later'), rejection);
    expect(logWrite).toHaveBeenCalledWith(expect.stringContaining('Main unhandled rejection:'));
  });
});

describe('engine connection', () => {
  it('gives the window a port on every load', async () => {
    await boot();
    win().webContents.emit('did-finish-load');
    expect(engine().postMessage).toHaveBeenCalledWith({ type: 'connect' }, [{ id: 1 }]);
    expect(win().webContents.postMessage).toHaveBeenCalledWith(ENGINE_PORT_CHANNEL, null, [
      { id: 2 },
    ]);
  });

  it('restarts a crashed engine, grants its paths and reports the restore', async () => {
    await boot();
    const first = engine();
    snapshot(first);
    first.emit('exit', 1);
    expect(state.engines).toHaveLength(2);
    expect(engine().postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'restore' }));
    expect(win().webContents.postMessage).toHaveBeenCalledWith(ENGINE_PORT_CHANNEL, null, [
      { id: 2 },
    ]);
    engine().emit('message', { type: 'restored', result: 'restored' });
    expect(win().webContents.send).toHaveBeenCalledWith(ENGINE_RESTARTED_CHANNEL, 'restored');
  });

  it('tells the window when the engine is down for good', async () => {
    await boot();
    for (let i = 0; i < 4; i++) engine().emit('exit', 1);
    expect(win().webContents.send).toHaveBeenCalledWith(ENGINE_DOWN_CHANNEL);
    expect(await invoke(ENGINE_IS_DOWN_CHANNEL)).toBe(true);
    // A load now gets no port.
    win().webContents.postMessage.mockClear();
    win().webContents.emit('did-finish-load');
    expect(win().webContents.postMessage).not.toHaveBeenCalled();
  });

  it('does not restart when quitting', async () => {
    await boot();
    state.appListeners.get('before-quit')![0]!();
    engine().emit('exit', 0);
    expect(state.engines).toHaveLength(1);
  });

  it('sends nothing to a closed window', async () => {
    await boot();
    win().emit('closed');
    engine().emit('exit', 1);
    expect(win().webContents.postMessage).not.toHaveBeenCalled();
  });
});

describe('file dialogs', () => {
  // Acks the grant the way the engine does.
  const ack = (path: string) =>
    queueMicrotask(() => engine().emit('message', { type: 'pathGranted', path }));

  it('opens a file, grants it to the engine, and returns the path', async () => {
    await boot();
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\a.lcshow'] });
    existing.folders.add('C:\\Shows');
    const result = invoke(CHOOSE_SHOW_TO_OPEN_CHANNEL, 'C:\\Shows');
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalled());
    // A message about another path is not the ack.
    engine().emit('message', { type: 'pathGranted', path: 'other' });
    engine().emit('message', undefined);
    ack('C:\\a.lcshow');
    expect(await result).toBe('C:\\a.lcshow');
    expect(engine().postMessage).toHaveBeenCalledWith({
      type: 'grantPath',
      path: 'C:\\a.lcshow',
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      win(),
      expect.objectContaining({ defaultPath: 'C:\\Shows', properties: ['openFile'] }),
    );
  });

  it('falls back to the OS folder when the remembered one is gone or not a string', async () => {
    await boot();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await invoke(CHOOSE_SHOW_TO_OPEN_CHANNEL, 'C:\\Gone');
    await invoke(CHOOSE_SHOW_TO_OPEN_CHANNEL, 42);
    for (const call of dialog.showOpenDialog.mock.calls as unknown[][]) {
      expect(call[1]).toMatchObject({ defaultPath: undefined });
    }
  });

  it('grants nothing on Cancel', async () => {
    await boot();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await invoke(CHOOSE_VENUE_TO_OPEN_CHANNEL)).toBeUndefined();
    expect(engine().postMessage).not.toHaveBeenCalled();
  });

  it('uses a dialog without a parent window when the sender has none', async () => {
    await boot();
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await state.handlers.get(CHOOSE_VENUE_TO_OPEN_CHANNEL)!({ sender: {} }, undefined);
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.not.objectContaining({ type: 1 }));
    expect(dialog.showOpenDialog.mock.calls[0]).toHaveLength(1);
  });

  it('saves to the current path, or suggests a name in the folder', async () => {
    await boot();
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    await invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, 'C:\\cur.lcshow', undefined, undefined);
    expect(optionsOf(dialog.showSaveDialog, 0)).toMatchObject({
      defaultPath: 'C:\\cur.lcshow',
    });
    existing.folders.add('C:\\Lib');
    await invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, undefined, 'C:\\Lib', 'Tour.lcshow');
    expect(optionsOf(dialog.showSaveDialog, 1).defaultPath).toMatch(/Lib.Tour\.lcshow$/);
    await invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, undefined, 'C:\\Gone', 'Tour.lcshow');
    expect(optionsOf(dialog.showSaveDialog, 2).defaultPath).toBe('Tour.lcshow');
    await invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, undefined, 'C:\\Lib', undefined);
    expect(optionsOf(dialog.showSaveDialog, 3).defaultPath).toBe('C:\\Lib');
    await invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, undefined, 5, 5);
    expect(optionsOf(dialog.showSaveDialog, 4).defaultPath).toBeUndefined();
  });

  it('grants a saved path', async () => {
    await boot();
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\n.lcshow' });
    const result = invoke(CHOOSE_SHOW_TO_SAVE_CHANNEL, undefined, undefined, 'n');
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalled());
    ack('C:\\n.lcshow');
    expect(await result).toBe('C:\\n.lcshow');
  });

  it('fails the grant when the engine is not running or exits first', async () => {
    await boot();
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\a'] });
    engine().pid = undefined;
    await expect(invoke(CHOOSE_SHOW_TO_OPEN_CHANNEL)).rejects.toThrow('not running');
    engine().pid = 7;
    const pending = invoke(CHOOSE_SHOW_TO_OPEN_CHANNEL);
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalled());
    // The exit restarts it, but this grant is lost.
    engine().emit('exit', 1);
    await expect(pending).rejects.toThrow('stopped');
  });

  it('grants both example files', async () => {
    await boot();
    const result = invoke(OPEN_EXAMPLE_CHANNEL);
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalledTimes(1));
    const first = engine().postMessage.mock.calls[0]![0].path;
    ack(first);
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalledTimes(2));
    ack(engine().postMessage.mock.calls[1]![0].path);
    const paths = await result;
    expect(paths.venue).toMatch(/demo\.lcvenue$/);
    expect(paths.show).toMatch(/demo\.lcshow$/);
    expect(paths.venue).toContain('examples');
  });

  it('finds the examples in resources when packaged', async () => {
    state.packaged = true;
    (process as { resourcesPath?: string }).resourcesPath = 'C:\\res';
    await boot();
    const result = invoke(OPEN_EXAMPLE_CHANNEL);
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalledTimes(1));
    ack(engine().postMessage.mock.calls[0]![0].path);
    await vi.waitFor(() => expect(engine().postMessage).toHaveBeenCalledTimes(2));
    ack(engine().postMessage.mock.calls[1]![0].path);
    expect((await result).venue).toContain('res');
  });
});

describe('save from snapshot', () => {
  async function down() {
    await boot();
    snapshot(engine());
    for (let i = 0; i < 4; i++) {
      engine().emit('exit', 1);
      if (i < 3) snapshot(engine());
    }
  }

  it('refuses while the engine is up', async () => {
    await boot();
    expect(await invoke(SAVE_FROM_SNAPSHOT_CHANNEL, 'show')).toBeUndefined();
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('refuses a bad document', async () => {
    await down();
    expect(await invoke(SAVE_FROM_SNAPSHOT_CHANNEL, 'nonsense')).toBeUndefined();
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('writes the chosen file from the snapshot', async () => {
    await down();
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\out.lcshow' });
    expect(await invoke(SAVE_FROM_SNAPSHOT_CHANNEL, 'show')).toBe('C:\\out.lcshow');
    expect(diskWrite).toHaveBeenCalledWith('show', 'C:\\out.lcshow', '{"file":true}');
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\out.lcvenue' });
    await invoke(SAVE_FROM_SNAPSHOT_CHANNEL, 'venue');
    expect(diskWrite).toHaveBeenCalledWith('venue', 'C:\\out.lcvenue', '{"file":true}');
  });

  it('saves nothing on Cancel, and works without a parent window', async () => {
    await down();
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    expect(await invoke(SAVE_FROM_SNAPSHOT_CHANNEL, 'show')).toBeUndefined();
    await state.handlers.get(SAVE_FROM_SNAPSHOT_CHANNEL)!({ sender: {} }, 'show');
    expect(diskWrite).not.toHaveBeenCalled();
  });
});

describe('small handlers', () => {
  it('reveals only files in the library backups folder', async () => {
    // An absolute path on this platform: resolve() adds the drive on Windows.
    state.paths['appData'] = path.resolve('/data');
    await boot();
    const backups = path.join(state.paths['userData']!, LIBRARY_BACKUPS_FOLDER);
    send(SHOW_LIBRARY_BACKUP_CHANNEL, win().webContents, 42);
    send(SHOW_LIBRARY_BACKUP_CHANNEL, win().webContents, path.join(backups, '..', 'x.json'));
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
    const inside = path.join(backups, 'a.json');
    send(SHOW_LIBRARY_BACKUP_CHANNEL, win().webContents, inside);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(inside);
  });

  it('opens a license file, and logs when it cannot', async () => {
    (process as { resourcesPath?: string }).resourcesPath = 'C:\\res';
    await boot();
    expect(await invoke(OPEN_LICENSE_CHANNEL, '../../etc/passwd')).toBe(false);
    expect(shell.openPath).not.toHaveBeenCalled();
    const good = 'license';
    expect(await invoke(OPEN_LICENSE_CHANNEL, good)).toBe(true);
    shell.openPath.mockResolvedValueOnce('nope');
    expect(await invoke(OPEN_LICENSE_CHANNEL, good)).toBe(false);
    expect(logWrite).toHaveBeenCalledWith(expect.stringContaining('nope'));
  });

  it('reports app info', async () => {
    await boot();
    expect(await invoke(APP_INFO_CHANNEL)).toMatchObject({
      appVersion: '1.2.3',
      electronVersion: process.versions.electron,
    });
  });
});

describe('update check', () => {
  it('checks 10 s after the first load and hands the result to the renderer', async () => {
    vi.useFakeTimers();
    try {
      await boot();
      win().webContents.emit('did-finish-load');
      expect(check.run).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(check.run).toHaveBeenCalledOnce();
      expect(await invoke(UPDATE_AVAILABLE_CHANNEL)).toEqual({ version: '9.9.9' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers enabled and check now, and takes a boolean setting only', async () => {
    await boot();
    expect(await invoke(UPDATE_ENABLED_CHANNEL)).toBe(true);
    expect(await invoke(CHECK_FOR_UPDATES_CHANNEL)).toBe('none');
    send(SET_UPDATE_ENABLED_CHANNEL, win().webContents, 'yes');
    expect(check.setEnabled).not.toHaveBeenCalled();
    send(SET_UPDATE_ENABLED_CHANNEL, win().webContents, false);
    expect(check.setEnabled).toHaveBeenCalledWith(false);
  });

  it('opens release pages only', async () => {
    await boot();
    send(OPEN_RELEASE_PAGE_CHANNEL, win().webContents, 'https://evil.example/');
    expect(shell.openExternal).not.toHaveBeenCalled();
    const url = 'https://github.com/GiorgosKoulouris/livecues-lightcues/releases/tag/v1.0.0';
    send(OPEN_RELEASE_PAGE_CHANNEL, win().webContents, url);
    expect(shell.openExternal).toHaveBeenCalledWith(url);
  });
});

describe('close guard', () => {
  const closeEvent = () => ({
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  });
  const requestClose = () => {
    const event = closeEvent();
    win().emit('close', event);
    return event;
  };
  const unsaved = (document: unknown, value: unknown, sender = win().webContents) =>
    send(UNSAVED_CHANNEL, sender, document, value);

  it('closes at once with nothing unsaved', async () => {
    await boot();
    expect(requestClose().defaultPrevented).toBe(false);
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
  });

  it('ignores reports from other senders and bad values', async () => {
    await boot();
    unsaved('show', true, {} as never);
    unsaved('bogus', true);
    unsaved('show', 'yes');
    expect(requestClose().defaultPrevented).toBe(false);
  });

  it('forgets a document that was saved', async () => {
    await boot();
    unsaved('show', true);
    unsaved('show', false);
    expect(requestClose().defaultPrevented).toBe(false);
  });

  it("closes on Don't Save", async () => {
    await boot();
    unsaved('show', true);
    dialog.showMessageBoxSync.mockReturnValue(1);
    requestClose();
    expect(win().close).toHaveBeenCalled();
  });

  it('stays open on Cancel', async () => {
    await boot();
    unsaved('show', true);
    dialog.showMessageBoxSync.mockReturnValue(2);
    expect(requestClose().defaultPrevented).toBe(true);
    expect(win().close).not.toHaveBeenCalled();
  });

  it('saves each unsaved document in turn, then closes', async () => {
    await boot();
    unsaved('show', true);
    unsaved('venue', true);
    dialog.showMessageBoxSync.mockReturnValue(0);
    expect(requestClose().defaultPrevented).toBe(true);
    const sent = () => win().webContents.send.mock.calls.map((c: unknown[]) => c[1]);
    const first = sent()[0] as string;
    // Another close request while saving does nothing more.
    requestClose();
    expect(dialog.showMessageBoxSync).toHaveBeenCalledTimes(1);
    // Answers for the wrong document or sender, or of the wrong type, are ignored.
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, first === 'show' ? 'venue' : 'show', true);
    send(SAVED_BEFORE_CLOSE_CHANNEL, {}, first, true);
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, 'bogus', true);
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, first, 'yes');
    expect(sent()).toHaveLength(1);
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, first, true);
    expect(sent()).toHaveLength(2);
    expect(win().close).not.toHaveBeenCalled();
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, sent()[1], true);
    expect(win().close).toHaveBeenCalled();
    expect(sent().every((s: unknown) => typeof s === 'string')).toBe(true);
    expect(win().webContents.send.mock.calls[0]![0]).toBe(SAVE_BEFORE_CLOSE_CHANNEL);
  });

  it('stops saving when one fails', async () => {
    await boot();
    unsaved('show', true);
    unsaved('venue', true);
    dialog.showMessageBoxSync.mockReturnValue(0);
    requestClose();
    send(SAVED_BEFORE_CLOSE_CHANNEL, win().webContents, 'show', false);
    expect(win().close).not.toHaveBeenCalled();
    // Free to ask again.
    dialog.showMessageBoxSync.mockReturnValue(2);
    requestClose();
    expect(dialog.showMessageBoxSync).toHaveBeenCalledTimes(2);
  });

  it('only warns while the engine is down', async () => {
    await boot();
    for (let i = 0; i < 4; i++) engine().emit('exit', 1);
    unsaved('show', true);
    dialog.showMessageBoxSync.mockReturnValue(1);
    requestClose();
    expect(win().close).not.toHaveBeenCalled();
    expect(optionsOf(dialog.showMessageBoxSync, 0).buttons).toContain('Close Anyway');
    dialog.showMessageBoxSync.mockReturnValue(0);
    requestClose();
    expect(win().close).toHaveBeenCalled();
  });

  it('drops unsaved state on a reload, and its listeners when closed', async () => {
    await boot();
    unsaved('show', true);
    win().webContents.emit('did-start-loading');
    expect(requestClose().defaultPrevented).toBe(false);
    win().emit('closed');
    expect(state.listeners.get(UNSAVED_CHANNEL)).toEqual([]);
    expect(state.listeners.get(SAVED_BEFORE_CLOSE_CHANNEL)).toEqual([]);
  });
});
