import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyShow } from '../../../shared/show';
import { emptyPatch } from '../../../shared/venue-patch';
import { installFakeEngine, type FakeEngine } from '../test-engine';
import { installFakeVisualiserWindow, type FakeVisualiserWindow } from '../test-visualiser-window';
import { UiProvider } from '../ui/UiProvider';
import { createSceneRenderer, type SceneRenderer } from './sceneRenderer';
import { forgetCamera, rememberCamera } from './cameraMemory';
import { setHandedOverHaze } from './handover';
import { DetachedVisualiser } from './DetachedVisualiser';

vi.mock('./sceneRenderer', () => ({ createSceneRenderer: vi.fn() }));

let engine: FakeEngine;
let windowBridge: FakeVisualiserWindow;
let engineDown: boolean;
const downListeners = new Set<() => void>();

beforeEach(() => {
  forgetCamera();
  setHandedOverHaze(undefined);
  engine = installFakeEngine();
  windowBridge = installFakeVisualiserWindow(true);
  engineDown = false;
  downListeners.clear();
  vi.stubGlobal('engineRecovery', {
    onRestarted: () => () => {},
    onDown: (listener: () => void) => {
      downListeners.add(listener);
      return () => void downListeners.delete(listener);
    },
    isDown: async () => engineDown,
    saveFromSnapshot: vi.fn(),
  });
  vi.mocked(createSceneRenderer).mockReturnValue({
    setModel: vi.fn(),
    setLooks: vi.fn(),
    setHaze: vi.fn(),
    setHouse: vi.fn(),
    setAssumedHaze: vi.fn(),
    setQuality: vi.fn(),
    setCamera: vi.fn(),
    camera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } })),
    dispose: vi.fn(),
  } as unknown as SceneRenderer);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const open = () =>
  engine.emit({
    type: 'venue',
    patch: emptyPatch({ width: 10, depth: 6 }),
    path: undefined,
    folder: undefined,
    unsaved: false,
    canUndo: false,
    canRedo: false,
  });

describe('DetachedVisualiser', () => {
  it('asks the engine for the Venue Patch and draws it', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    expect(engine.sent.map((c) => c.type)).toContain('getVenue');
    open();
    await screen.findByRole('button', { name: 'FOH' });
    expect(createSceneRenderer).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'FOH' })).toBeInTheDocument();
  });

  it('shows the Visualiser and nothing else of the app', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await screen.findByRole('button', { name: 'FOH' });
    expect(screen.queryByRole('navigation', { name: 'Views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fallback Panel' })).not.toBeInTheDocument();
  });

  it('titles its window', () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    expect(document.title).toBe('LightCues – Visualiser');
  });

  it('opens on the camera and haze override the View handed over', async () => {
    const pose = { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
    windowBridge.held = { camera: { pose, stage: { width: 10, depth: 6 } }, haze: 0.4 };
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    expect(await screen.findByText('40%')).toBeInTheDocument();
    expect(vi.mocked(createSceneRenderer).mock.calls[0]?.[1]).toEqual(pose);
  });

  it('opens with a cleared override when the View had none', async () => {
    windowBridge.held = { haze: undefined };
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    expect(await screen.findByText('Off')).toBeInTheDocument();
  });

  it('still shows the Visualiser, on defaults, when the hand-over cannot be read', async () => {
    const handover = windowBridge.deferNext('getState');
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await handover.reject(new Error('main is gone'));
    expect(await screen.findByRole('button', { name: 'FOH' })).toBeInTheDocument();
  });

  it('sends main its camera and haze override as they change, for a close with the X', async () => {
    rememberCamera(
      { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } },
      { width: 10, depth: 6 },
    );
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await screen.findByRole('slider', { name: 'Assume haze' });
    fireEvent.change(screen.getByRole('slider', { name: 'Assume haze' }), {
      target: { value: '25' },
    });
    expect(windowBridge.held?.haze).toBe(0.25);
    expect(windowBridge.held?.camera).toBeDefined();
  });

  it('the Reattach button asks main to reattach', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Reattach' }));
    expect(windowBridge.reattach).toHaveBeenCalledOnce();
  });

  describe('Fallback Panel keys', () => {
    const openShow = () => {
      engine.emit({
        type: 'show',
        show: emptyShow(),
        path: undefined,
        folder: undefined,
        unsaved: false,
        canUndo: false,
        canRedo: false,
      });
      engine.emit({
        type: 'playback',
        active: {},
        mode: 'monitor',
        grandMaster: 0.5,
        blackout: false,
        freeze: false,
      });
    };
    const renderDetached = async () => {
      render(
        <UiProvider>
          <DetachedVisualiser />
        </UiProvider>,
      );
      openShow();
      await screen.findByRole('button', { name: 'Reattach' }).catch(() => undefined);
      engine.sent.length = 0;
    };

    it('runs Blackout, Base Look, Tap Tempo, Freeze and Grand Master from the keys', async () => {
      await renderDetached();
      await userEvent.keyboard('b0ft-=');
      expect(engine.sent.map((c) => c.type)).toEqual([
        'setBlackout',
        'goBaseLook',
        'setFreeze',
        'tapTempo',
        'setGrandMaster',
        'setGrandMaster',
      ]);
    });

    it('does nothing for file, undo and View shortcuts', async () => {
      await renderDetached();
      await userEvent.keyboard('{Control>}s{/Control}{Control>}z{/Control}{Control>}2{/Control}');
      expect(engine.sent).toEqual([]);
    });
  });

  const playback = (mode: 'monitor' | 'blind') =>
    engine.emit({
      type: 'playback',
      active: {},
      mode,
      grandMaster: 1,
      blackout: false,
      freeze: false,
    });

  it('shows the Blind badge while the mode is Blind, and hides it again', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await screen.findByRole('button', { name: 'FOH' });
    expect(screen.queryByText('Blind')).not.toBeInTheDocument();
    playback('blind');
    expect(await screen.findByText('Blind')).toBeInTheDocument();
    playback('monitor');
    expect(screen.queryByText('Blind')).not.toBeInTheDocument();
  });

  it('shows a notice that points to the main window when the engine goes down, with no save controls', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await screen.findByRole('button', { name: 'FOH' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => downListeners.forEach((l) => l()));
    expect(screen.getByRole('alert')).toHaveTextContent('main window');
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  });

  it('shows the notice at once when the engine was already down', async () => {
    engineDown = true;
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('main window');
  });

  describe('while its window is hidden', () => {
    const setVisibility = (state: 'hidden' | 'visible') => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
    };
    const sent = (type: string) => engine.sent.filter((c) => c.type === type).length;

    it('leaves the preview feed when minimized and draws the current look when restored', async () => {
      render(
        <UiProvider>
          <DetachedVisualiser />
        </UiProvider>,
      );
      open();
      await screen.findByRole('button', { name: 'FOH' });
      expect(sent('startPreview')).toBe(1);
      expect(sent('stopPreview')).toBe(0);
      setVisibility('hidden');
      expect(sent('stopPreview')).toBe(1);
      const drawing = vi.mocked(createSceneRenderer).mock.results[0]!.value as SceneRenderer;
      vi.mocked(drawing.setLooks).mockClear();
      setVisibility('visible');
      expect(sent('startPreview')).toBe(2);
      // The engine answers a start with the current look.
      engine.emit({ type: 'preview', lights: {}, haze: 0.5, house: undefined });
      expect(drawing.setLooks).toHaveBeenCalled();
      expect(drawing.setHaze).toHaveBeenLastCalledWith(0.5);
    });

    it('keeps its renderer across a hide', async () => {
      render(
        <UiProvider>
          <DetachedVisualiser />
        </UiProvider>,
      );
      open();
      await screen.findByRole('button', { name: 'FOH' });
      setVisibility('hidden');
      setVisibility('visible');
      expect(createSceneRenderer).toHaveBeenCalledOnce();
    });
  });
});
