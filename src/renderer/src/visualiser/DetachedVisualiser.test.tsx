import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPatch } from '../../../shared/venue-patch';
import { installFakeEngine, type FakeEngine } from '../test-engine';
import { installFakeVisualiserWindow, type FakeVisualiserWindow } from '../test-visualiser-window';
import { UiProvider } from '../ui/UiProvider';
import { createSceneRenderer, type SceneRenderer } from './sceneRenderer';
import { DetachedVisualiser } from './DetachedVisualiser';

vi.mock('./sceneRenderer', () => ({ createSceneRenderer: vi.fn() }));

let engine: FakeEngine;
let windowBridge: FakeVisualiserWindow;

beforeEach(() => {
  engine = installFakeEngine();
  windowBridge = installFakeVisualiserWindow(true);
  vi.mocked(createSceneRenderer).mockReturnValue({
    setModel: vi.fn(),
    setLooks: vi.fn(),
    setHaze: vi.fn(),
    setHouse: vi.fn(),
    setAssumedHaze: vi.fn(),
    setQuality: vi.fn(),
    setCamera: vi.fn(),
    camera: vi.fn(),
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
  it('asks the engine for the Venue Patch and draws it', () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    expect(engine.sent.map((c) => c.type)).toContain('getVenue');
    open();
    expect(createSceneRenderer).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'FOH' })).toBeInTheDocument();
  });

  it('shows the Visualiser and nothing else of the app', () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
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

  it('the Reattach button asks main to reattach', async () => {
    render(
      <UiProvider>
        <DetachedVisualiser />
      </UiProvider>,
    );
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Reattach' }));
    expect(windowBridge.reattach).toHaveBeenCalledOnce();
  });
});
