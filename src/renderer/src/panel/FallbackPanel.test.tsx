import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Scene, Show } from '../../../shared/show';
import type { PlaybackState } from '../show/usePlayback';
import { installFakeEngine, type FakeEngine } from '../test-engine';
import { UiProvider } from '../ui/UiProvider';
import { FallbackPanel } from './FallbackPanel';
import { usePanelKeys } from './usePanelKeys';

const scene = (id: string, name: string): Scene => ({
  id,
  name,
  tags: [],
  layer: 'layer-1',
  fadeIn: 0,
  rules: [],
});

const SHOW: Show = {
  layers: [{ id: 'layer-1', name: 'Base' }],
  scenes: [scene('warm', 'Warm'), scene('blue', 'Blue')],
  triggers: [],
  baseLook: 'warm',
  housePresets: [{ id: 'dim', name: 'Show dim', fade: 3 }],
  hazePresets: [{ id: 'light', name: 'Light haze', level: 0.3, fade: 5 }],
};

const PLAYBACK: PlaybackState = {
  active: { 'layer-1': 'blue' },
  mode: 'monitor',
  grandMaster: 0.8,
  blackout: false,
  freeze: false,
};

// The panel with its keys, as the app mounts them.
function Panel({ show, playback }: { show: Show | undefined; playback: PlaybackState }) {
  usePanelKeys(show, playback);
  return <FallbackPanel show={show} playback={playback} tempo={undefined} />;
}

function renderPanel(playback: PlaybackState = PLAYBACK, show: Show | null = SHOW) {
  return render(
    <UiProvider>
      <Panel show={show ?? undefined} playback={playback} />
    </UiProvider>,
  );
}

let engine: FakeEngine;

beforeEach(() => {
  engine = installFakeEngine();
});

describe('FallbackPanel', () => {
  it('has Blackout, Base Look, Grand Master, Tap Tempo and Freeze, and no Scene or preset buttons', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: 'Fallback Panel' });

    expect(
      within(panel)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Blackout', 'Base Look: Warm', 'Tap', 'Freeze']);
    expect(within(panel).getByRole('slider', { name: /Grand Master/ })).toHaveValue('0.8');
    expect(within(panel).getByText('80%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show dim|Light haze|Haze Off/ })).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('puts each key in its tooltip, not on the button', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /Blackout/ })).toHaveAttribute(
      'title',
      'Blackout (B)',
    );
    expect(screen.getByRole('button', { name: /Base Look/ })).toHaveAttribute(
      'title',
      'Base Look: Warm (0)',
    );
    expect(screen.getByRole('button', { name: /Tap/ })).toHaveAttribute('title', 'Tap Tempo (T)');
    expect(screen.getByRole('button', { name: /Freeze/ })).toHaveAttribute('title', 'Freeze (F)');
    expect(screen.getByLabelText(/Grand Master/).closest('label')).toHaveAttribute(
      'title',
      'Grand Master (- +)',
    );
    expect(document.querySelector('kbd')).toBeNull();
  });

  it('shows nothing while the Show or playback loads', () => {
    renderPanel(PLAYBACK, null);

    expect(screen.queryByRole('region', { name: 'Fallback Panel' })).toBeNull();
    expect(screen.queryByText(/Loading/)).toBeNull();
  });

  it('runs its buttons and keys', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /Blackout/ }));
    await userEvent.click(screen.getByRole('button', { name: /Base Look/ }));
    await userEvent.click(screen.getByRole('button', { name: /Freeze/ }));
    await userEvent.keyboard('b0f');
    await userEvent.keyboard('1{Shift>}1{/Shift}');

    expect(engine.sent).toEqual([
      { type: 'setBlackout', on: true },
      { type: 'goBaseLook' },
      { type: 'setFreeze', on: true },
      { type: 'setBlackout', on: true },
      { type: 'goBaseLook' },
      { type: 'setFreeze', on: true },
    ]);
  });

  it('shows Blackout pressed while on', () => {
    renderPanel({ ...PLAYBACK, blackout: true });

    expect(screen.getByRole('button', { name: /Blackout/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
