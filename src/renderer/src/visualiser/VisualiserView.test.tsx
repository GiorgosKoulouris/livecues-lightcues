import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPatch } from '../../../shared/venue-patch';
import { installFakeEngine, type FakeEngine } from '../test-engine';
import { installFakeVisualiserWindow, type FakeVisualiserWindow } from '../test-visualiser-window';
import { UiProvider } from '../ui/UiProvider';
import type { RendererCallbacks, SceneRenderer } from './sceneRenderer';
import { createSceneRenderer } from './sceneRenderer';
import { buildScene } from './sceneModel';
import { forgetCamera } from './cameraMemory';
import { acceptHandover } from './handover';
import { VisualiserView } from './VisualiserView';

vi.mock('./sceneRenderer', () => ({ createSceneRenderer: vi.fn() }));

const PATCH = emptyPatch({ width: 10, depth: 6 });
const cameras = buildScene(PATCH).cameras;

let renderer: { [K in keyof SceneRenderer]: ReturnType<typeof vi.fn> };
let callbacks: RendererCallbacks;
let engine: FakeEngine;
let windowBridge: FakeVisualiserWindow;

beforeEach(() => {
  forgetCamera();
  engine = installFakeEngine();
  windowBridge = installFakeVisualiserWindow();
  renderer = {
    setModel: vi.fn(),
    setLooks: vi.fn(),
    setHaze: vi.fn(),
    setHouse: vi.fn(),
    setAssumedHaze: vi.fn(),
    setQuality: vi.fn(),
    setCamera: vi.fn(),
    camera: vi.fn(() => cameras.foh),
    dispose: vi.fn(),
  };
  vi.mocked(createSceneRenderer).mockImplementation((_host, _pose, given) => {
    callbacks = given;
    return renderer as unknown as SceneRenderer;
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const show = (patch = PATCH, blind = false) =>
  render(
    <UiProvider>
      <VisualiserView patch={patch} blind={blind} />
    </UiProvider>,
  );

describe('VisualiserView', () => {
  it('draws the model, opening on FOH', () => {
    show();
    expect(createSceneRenderer).toHaveBeenCalledOnce();
    expect(vi.mocked(createSceneRenderer).mock.calls[0]?.[1]).toEqual(cameras.foh);
    expect(renderer.setModel).toHaveBeenCalledWith(expect.objectContaining({ bodies: [] }));
  });

  it.each([
    ['FOH', 'foh'],
    ['Top', 'top'],
    ['Side', 'side'],
    ['Reset', 'foh'],
  ] as const)('the %s button moves the camera to the %s preset', async (name, preset) => {
    show();
    await userEvent.click(screen.getByRole('button', { name }));
    expect(renderer.setCamera).toHaveBeenCalledWith(cameras[preset]);
  });

  it('opens on the free camera it was left on', () => {
    show();
    const moved = { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
    act(() => callbacks.onCamera(moved));
    cleanup();
    show();
    expect(vi.mocked(createSceneRenderer).mock.calls[1]?.[1]).toEqual(moved);
  });

  it('forgets the free camera when the stage bounds change', () => {
    show();
    const moved = { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
    act(() => callbacks.onCamera(moved));
    cleanup();
    const other = emptyPatch({ width: 20, depth: 8 });
    show(other);
    expect(vi.mocked(createSceneRenderer).mock.calls[1]?.[1]).toEqual(
      buildScene(other).cameras.foh,
    );
  });

  it('goes back to FOH when the stage bounds change while open', () => {
    const view = (patch: typeof PATCH) => (
      <UiProvider>
        <VisualiserView patch={patch} />
      </UiProvider>
    );
    const { rerender } = render(view(PATCH));
    const other = emptyPatch({ width: 20, depth: 8 });
    rerender(view(other));
    expect(renderer.setCamera).toHaveBeenCalledWith(buildScene(other).cameras.foh);
  });

  describe('hand-over to the Detached Visualiser', () => {
    const moved = { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
    const stage = { width: 10, depth: 6 };

    it('sends main its camera on mount and as it moves', () => {
      show();
      expect(windowBridge.held).toMatchObject({ camera: { pose: cameras.foh, stage } });
      act(() => callbacks.onCamera(moved));
      expect(windowBridge.held).toMatchObject({ camera: { pose: moved, stage } });
    });

    it('sends main its haze override as it is set, and cleared', async () => {
      show();
      expect(windowBridge.held?.haze).toBeUndefined();
      fireEvent.change(screen.getByRole('slider', { name: 'Assume haze' }), {
        target: { value: '70' },
      });
      expect(windowBridge.held?.haze).toBe(0.7);
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(windowBridge.held?.haze).toBeUndefined();
    });

    it('never sends the override to the engine, so no Hazer gets it', () => {
      show();
      fireEvent.change(screen.getByRole('slider', { name: 'Assume haze' }), {
        target: { value: '70' },
      });
      expect(engine.sent.filter((c) => /haze/i.test(c.type))).toEqual([]);
    });

    it('opens on the camera and haze override it was handed', () => {
      acceptHandover({ camera: { pose: moved, stage }, haze: 0.4 });
      show();
      expect(vi.mocked(createSceneRenderer).mock.calls[0]?.[1]).toEqual(moved);
      expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(0.4);
      expect(screen.getByText('40%')).toBeInTheDocument();
    });

    it('a cleared override handed over stays cleared', () => {
      acceptHandover({ camera: { pose: moved, stage }, haze: 0.4 });
      cleanup();
      acceptHandover({ camera: { pose: moved, stage } });
      show();
      expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(undefined);
      expect(screen.getByText('Off')).toBeInTheDocument();
    });

    it('does not keep a handed-over override once the Visualiser is closed', () => {
      acceptHandover({ haze: 0.4 });
      show();
      cleanup();
      show();
      expect(screen.getByText('Off')).toBeInTheDocument();
    });
  });

  it('builds the scene once on mount', () => {
    show();
    expect(renderer.setModel).toHaveBeenCalledOnce();
  });

  it('builds the scene again when the patch changes', () => {
    const view = (patch: typeof PATCH) => (
      <UiProvider>
        <VisualiserView patch={patch} />
      </UiProvider>
    );
    const { rerender } = render(view(PATCH));
    rerender(view({ ...PATCH }));
    expect(renderer.setModel).toHaveBeenCalledTimes(2);
  });

  it('shows the name of the hovered Fixture', () => {
    show();
    act(() => callbacks.onHover({ name: 'Front PAR 1', x: 10, y: 10 }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Front PAR 1');
    act(() => callbacks.onHover(undefined));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('frees the renderer when closed', () => {
    show();
    cleanup();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('points to the Preview when WebGL fails', () => {
    vi.mocked(createSceneRenderer).mockImplementation(() => {
      throw new Error('no WebGL');
    });
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Preview in Show and Perform/);
    expect(screen.queryByRole('button', { name: 'FOH' })).not.toBeInTheDocument();
  });

  it('asks for a Venue Patch while none is open', () => {
    render(
      <UiProvider>
        <VisualiserView patch={undefined} />
      </UiProvider>,
    );
    expect(screen.getByText(/Open a Venue Patch/)).toBeInTheDocument();
    expect(createSceneRenderer).not.toHaveBeenCalled();
  });

  it('starts the preview on mount and stops it on unmount', () => {
    show();
    expect(engine.sent.map((c) => c.type)).toEqual(['startPreview']);
    cleanup();
    expect(engine.sent.map((c) => c.type)).toEqual(['startPreview', 'stopPreview']);
  });

  it('does not start the preview without a Venue Patch', () => {
    render(
      <UiProvider>
        <VisualiserView patch={undefined} />
      </UiProvider>,
    );
    expect(engine.sent).toEqual([]);
  });

  it('does not start the preview when WebGL fails', () => {
    vi.mocked(createSceneRenderer).mockImplementation(() => {
      throw new Error('no WebGL');
    });
    show();
    expect(engine.sent).toEqual([]);
  });

  it('draws each preview event straight into the scene', () => {
    show();
    renderer.setLooks.mockClear();
    engine.emit({ type: 'preview', lights: {}, haze: 0 });
    engine.emit({ type: 'preview', lights: {}, haze: 0 });
    expect(renderer.setLooks).toHaveBeenCalledTimes(2);
  });

  it('passes the looks of the patched Fixtures to the scene', () => {
    const patch = {
      ...PATCH,
      profiles: [
        {
          id: 'p',
          manufacturer: 'A',
          model: 'p',
          defaultRole: 'Wash' as const,
          modes: [{ name: 'm', channels: [] }],
        },
      ],
      fixtures: [
        {
          id: 'a',
          name: 'A',
          profileId: 'p',
          mode: 'm',
          universe: 1,
          address: 1,
          x: 0,
          y: 1,
          height: 5,
        },
      ],
    };
    show(patch);
    engine.emit({
      type: 'preview',
      lights: { a: { intensity: 1, red: 1, green: 0, blue: 0 } },
      haze: 0,
    });
    const looks = renderer.setLooks.mock.lastCall?.[0];
    expect(looks).toEqual([
      expect.objectContaining({ id: 'a', intensity: 1, cone: expect.anything() }),
    ]);
  });

  it('shows a Blind badge only while Blind is on', () => {
    show(PATCH, true);
    expect(screen.getByText('Blind')).toBeInTheDocument();
    cleanup();
    show(PATCH, false);
    expect(screen.queryByText('Blind')).not.toBeInTheDocument();
  });

  it('passes the preview haze to the scene', () => {
    show();
    engine.emit({ type: 'preview', lights: {}, haze: 0.6 });
    expect(renderer.setHaze).toHaveBeenLastCalledWith(0.6);
  });

  it('passes the preview house ambient to the scene, none when absent', () => {
    show();
    const house = { intensity: 0.4, red: 1, green: 0.8, blue: 0.6 };
    engine.emit({ type: 'preview', lights: {}, haze: 0, house });
    expect(renderer.setHouse).toHaveBeenLastCalledWith(house);
    engine.emit({ type: 'preview', lights: {}, haze: 0 });
    expect(renderer.setHouse).toHaveBeenLastCalledWith(undefined);
  });

  it('Assume haze replaces the density, and Clear gives it back to the Hazers', async () => {
    show();
    expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(screen.getByRole('slider', { name: 'Assume haze' }), {
      target: { value: '70' },
    });
    expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(0.7);
    expect(screen.getByText('70%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('picking 0% on the Assume haze slider sets it, though the value is unchanged', () => {
    show();
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Assume haze' }), {
      target: { value: '0' },
    });
    expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(0);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('does not save the Assume haze or the quality', async () => {
    show();
    fireEvent.change(screen.getByRole('slider', { name: 'Assume haze' }), {
      target: { value: '70' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Low' }));
    cleanup();
    show();
    expect(renderer.setAssumedHaze).toHaveBeenLastCalledWith(undefined);
    expect(renderer.setQuality).toHaveBeenLastCalledWith('high');
  });

  it('the High and Low buttons set the quality, High first', async () => {
    show();
    expect(renderer.setQuality).toHaveBeenLastCalledWith('high');
    expect(screen.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Low' }));
    expect(renderer.setQuality).toHaveBeenLastCalledWith('low');
    expect(screen.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not fill the pressed quality key with Signal', () => {
    show();
    const high = screen.getByRole('button', { name: 'High' });
    expect(high.className).not.toMatch(/primary/);
  });

  it('has a window button only when given one, and it runs the action', async () => {
    show();
    expect(screen.queryByRole('button', { name: 'Detach' })).not.toBeInTheDocument();
    cleanup();
    const onClick = vi.fn();
    render(
      <UiProvider>
        <VisualiserView patch={PATCH} windowButton={{ label: 'Detach', onClick }} />
      </UiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Detach' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
