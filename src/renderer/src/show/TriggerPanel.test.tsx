import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MidiInputStatus } from '../../../shared/protocol';
import type { Scene, Show, Trigger } from '../../../shared/show';
import { installFakeEngine, type FakeEngine } from '../test-engine';
import { UiProvider } from '../ui/UiProvider';
import { TriggerPanel } from './TriggerPanel';

afterEach(cleanup);

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
  triggers: [
    { channel: 2, note: 62, scene: 'blue', mode: 'flash' },
    { channel: 1, note: 60, scene: 'warm', mode: 'go' },
  ],
  baseLook: 'warm',
  panelScenes: [],
  housePresets: [{ id: 'bar', name: 'Bar', fade: 1, note: { channel: 1, note: 72 } }],
};

let engine: FakeEngine;

const CONNECTED: MidiInputStatus = { ports: ['Pad'], selected: 'Pad', state: 'connected' };

function setup(options: { show?: Show; status?: MidiInputStatus | null; removed?: boolean } = {}) {
  const { show = SHOW, removed = true } = options;
  // null is no status yet.
  const status = options.status === null ? undefined : (options.status ?? CONNECTED);
  engine = installFakeEngine();
  const onPut = vi.fn<(t: Trigger) => void>();
  const onRemove = vi.fn(async () => removed);
  render(
    <UiProvider>
      <TriggerPanel show={show} status={status} onPut={onPut} onRemove={onRemove} />
    </UiProvider>,
  );
  return { onPut, onRemove, user: userEvent.setup() };
}

describe('MIDI input', () => {
  it('waits for the engine without a status', () => {
    setup({ status: null });
    expect(screen.getByText(/waiting for the engine/)).toBeTruthy();
  });

  it('shows Listening when connected', () => {
    setup();
    expect(screen.getByText('Listening')).toBeTruthy();
  });

  it('shows no badge when nothing is selected', () => {
    setup({ status: { ports: ['Pad'], state: 'none' } });
    expect(screen.queryByText('Listening')).toBeNull();
  });

  it('warns about a lost input and keeps it listed', () => {
    setup({ status: { ports: [], selected: 'Pad', state: 'lost' } });
    expect(screen.getByText(/is lost/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Pad (not found)' })).toBeTruthy();
  });

  it('selects and deselects an input', async () => {
    const { user } = setup({ status: { ports: ['Pad', 'Keys'], state: 'none' } });
    await user.selectOptions(screen.getByLabelText('MIDI Input'), 'Keys');
    expect(engine.sent).toContainEqual({ type: 'selectMidiInput', name: 'Keys' });
    await user.selectOptions(screen.getByLabelText('MIDI Input'), 'None');
    expect(engine.sent).toContainEqual({ type: 'selectMidiInput', name: undefined });
  });
});

describe('Triggers table', () => {
  it('lists Triggers by channel then note', () => {
    setup();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]!.textContent).toContain('Warm');
    expect(rows[1]!.textContent).toContain('Blue');
  });

  it('says so when there are none', () => {
    setup({ show: { ...SHOW, triggers: [] } });
    expect(screen.getByText(/No Triggers yet/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Triggers' })).toBeNull();
  });

  it('changes the mode of a Trigger', async () => {
    const { onPut, user } = setup();
    await user.selectOptions(screen.getByLabelText('Mode for C4 on channel 1'), 'release');
    expect(onPut).toHaveBeenCalledWith({ channel: 1, note: 60, scene: 'warm', mode: 'release' });
  });

  it('removes a Trigger and confirms', async () => {
    const { onRemove, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Remove the Trigger on C4 on channel 1' }));
    expect(onRemove).toHaveBeenCalledWith({ channel: 1, note: 60 });
    expect(await screen.findByText(/Removed the Trigger on C4 on channel 1 to Warm/)).toBeTruthy();
  });

  it('stays quiet when the removal is refused', async () => {
    const { user } = setup({ removed: false });
    await user.click(screen.getByRole('button', { name: 'Remove the Trigger on C4 on channel 1' }));
    expect(screen.queryByText(/Removed the Trigger/)).toBeNull();
  });
});

describe('New Trigger', () => {
  it('maps a typed channel, note, scene and mode', async () => {
    const { onPut, user } = setup();
    const channel = screen.getByLabelText('Channel');
    await user.clear(channel);
    await user.type(channel, '3');
    const note = screen.getByLabelText('Note');
    await user.clear(note);
    await user.type(note, '64');
    await user.selectOptions(screen.getByLabelText('Scene'), 'Blue');
    await user.selectOptions(screen.getByLabelText('Mode'), 'flash');
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(onPut).toHaveBeenCalledWith({ channel: 3, note: 64, scene: 'blue', mode: 'flash' });
  });

  it('defaults to the first Scene', async () => {
    const { onPut, user } = setup({ show: { ...SHOW, triggers: [] } });
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(onPut).toHaveBeenCalledWith({ channel: 1, note: 60, scene: 'warm', mode: 'go' });
  });

  it('cannot map without Scenes', () => {
    setup({ show: { ...SHOW, scenes: [], triggers: [] } });
    expect(screen.getByRole('button', { name: 'Map' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Scene').hasAttribute('disabled')).toBe(true);
  });

  it('says when it replaces a Trigger', () => {
    setup();
    expect(screen.getByText('Replaces the Trigger for Warm.')).toBeTruthy();
  });

  it('refuses the note of a House Preset', async () => {
    const { user } = setup();
    const note = screen.getByLabelText('Note');
    await user.clear(note);
    await user.type(note, '72');
    expect(screen.getByText(/note of House Preset Bar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map' }).hasAttribute('disabled')).toBe(true);
  });

  it('learns a note from the next one played', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Learn' }));
    expect(engine.sent).toContainEqual({ type: 'learnTrigger' });
    expect(screen.getByRole('button', { name: 'Play a note…' })).toBeTruthy();
    engine.emit({ type: 'triggerLearned', note: { channel: 5, note: 70 } });
    expect(screen.getByLabelText('Channel')).toHaveProperty('value', '5');
    expect(screen.getByLabelText('Note')).toHaveProperty('value', '70');
    expect(await screen.findByRole('button', { name: 'Learn' })).toBeTruthy();
    expect(engine.sent).toContainEqual({ type: 'cancelLearn' });
  });
});
