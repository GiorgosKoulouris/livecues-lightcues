import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability, FixtureProfile } from '../../../shared/fixture-profile';
import { blankChannel } from '../../../shared/profile-edit';
import { UiProvider } from '../ui/UiProvider';
import { ProfileEditor } from './ProfileEditor';

afterEach(cleanup);

const base = (): FixtureProfile => ({
  id: 'acme/par',
  manufacturer: 'Acme',
  model: 'Par',
  defaultRole: 'Wash',
  modes: [
    {
      name: '3ch',
      channels: [
        blankChannel('Dimmer'),
        { kind: 'fine', name: 'Dimmer fine', of: 'Dimmer', byte: 1, defaultValue: 0 },
        { kind: 'unused' },
      ],
    },
  ],
});

let latest: FixtureProfile;

interface Options {
  profile?: FixtureProfile;
  unsaved?: boolean;
  isNew?: boolean;
  errors?: string[];
  saving?: boolean;
  onDelete?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}

// The editor is controlled: this keeps the draft the way the library view does.
function Harness({ profile, ...rest }: Options) {
  const [draft, setDraft] = useState(() => {
    const initial = profile ?? base();
    latest = initial;
    return initial;
  });
  return (
    <ProfileEditor
      profile={draft}
      title="Acme Par"
      unsaved={rest.unsaved ?? true}
      isNew={rest.isNew ?? false}
      errors={rest.errors ?? []}
      saving={rest.saving ?? false}
      onChange={(next) => {
        latest = next;
        setDraft(next);
      }}
      onSave={rest.onSave ?? (() => {})}
      onCancel={rest.onCancel ?? (() => {})}
      onDelete={rest.onDelete}
    />
  );
}

const setup = (options: Options = {}) => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <Harness {...options} />
    </UiProvider>,
  );
  return user;
};

const withChannel = (channel: FixtureProfile['modes'][number]['channels'][number]) => {
  const profile = base();
  profile.modes[0]!.channels = [channel];
  return profile;
};

const control = (capability: Capability) =>
  withChannel({
    kind: 'control',
    name: 'Ch',
    defaultValue: 0,
    ranges: [{ from: 0, to: 255, capability }],
  });

const capabilityOf = () => {
  const channel = latest.modes[0]!.channels[0]!;
  if (channel.kind !== 'control') throw new Error('not a control channel');
  return channel.ranges[0]!.capability;
};

describe('header', () => {
  it('shows the unsaved badge, errors and the id', () => {
    setup({ errors: ['Bad thing'] });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Bad thing');
    expect(screen.getByText('acme/par')).toBeTruthy();
  });

  it('disables Cancel and Save without edits, and Cancel stays on for a new Profile', () => {
    setup({ unsaved: false });
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    cleanup();
    setup({ unsaved: false, isNew: true });
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables Save while saving', () => {
    setup({ saving: true });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('calls save, cancel and delete', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const user = setup({ onSave, onCancel, onDelete });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Delete Profile' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('offers no delete without a handler', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Delete Profile' })).toBeNull();
  });

  it('derives the id from the manufacturer and model', async () => {
    const user = setup();
    await user.clear(screen.getByLabelText('Model'));
    expect(latest.model).toBe('Par');
    expect(screen.getByText('Model is required')).toBeTruthy();
    await user.type(screen.getByLabelText('Model'), 'Spot');
    expect(latest.model).toBe('Spot');
    expect(latest.id).toBe('acme/spot');
    await user.clear(screen.getByLabelText('Manufacturer'));
    await user.type(screen.getByLabelText('Manufacturer'), 'Beam');
    expect(latest.id).toBe('beam/spot');
  });

  it('changes the default role', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Default Role'), 'Strobe');
    expect(latest.defaultRole).toBe('Strobe');
  });
});

describe('modes', () => {
  it('adds and duplicates a mode and selects it', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add mode' }));
    expect(latest.modes.map((m) => m.name)).toEqual(['3ch', 'Mode 2']);
    expect(screen.getByRole('tab', { name: /Mode 2/ }).getAttribute('aria-selected')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Duplicate mode' }));
    expect(latest.modes.map((m) => m.name)).toEqual(['3ch', 'Mode 2', 'Mode 2 copy']);
  });

  it('renames a mode and removes it, but never the last one', async () => {
    const user = setup();
    expect(screen.queryByRole('button', { name: 'Remove mode' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add mode' }));
    await user.clear(screen.getByLabelText('Mode name'));
    await user.type(screen.getByLabelText('Mode name'), 'Wide');
    expect(latest.modes[1]!.name).toBe('Wide');
    await user.click(screen.getByRole('button', { name: 'Remove mode' }));
    expect(latest.modes.map((m) => m.name)).toEqual(['3ch']);
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('switches mode by tab', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add mode' }));
    await user.click(screen.getByRole('tab', { name: /3ch/ }));
    expect(screen.getByLabelText('Mode name')).toHaveProperty('value', '3ch');
  });
});

describe('channels', () => {
  it('adds, moves and removes channels', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add channel' }));
    expect(latest.modes[0]!.channels).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Move channel 1 up' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByRole('button', { name: 'Move channel 4 down' }).hasAttribute('disabled'),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Move channel 1 down' }));
    expect(latest.modes[0]!.channels[1]).toMatchObject({ name: 'Dimmer' });
    await user.click(screen.getByRole('button', { name: 'Move channel 2 up' }));
    expect(latest.modes[0]!.channels[0]).toMatchObject({ name: 'Dimmer' });
    await user.click(screen.getByRole('button', { name: 'Remove channel 3' }));
    expect(latest.modes[0]!.channels).toHaveLength(3);
  });

  it('renames a channel and keeps fine channels pointing at it', async () => {
    const user = setup();
    await user.clear(screen.getByLabelText('Name of channel 1'));
    await user.type(screen.getByLabelText('Name of channel 1'), 'Level');
    expect(latest.modes[0]!.channels[0]).toMatchObject({ name: 'Level' });
    expect(latest.modes[0]!.channels[1]).toMatchObject({ of: 'Level' });
  });

  it('sets a default value', async () => {
    const user = setup();
    await user.clear(screen.getByLabelText('Default of channel 1'));
    await user.type(screen.getByLabelText('Default of channel 1'), '12');
    expect(latest.modes[0]!.channels[0]).toMatchObject({ defaultValue: 12 });
  });

  it('changes the kind of a channel', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Kind of channel 1'), 'unused');
    expect(latest.modes[0]!.channels[0]).toEqual({ kind: 'unused' });
    await user.selectOptions(screen.getByLabelText('Kind of channel 1'), 'control');
    expect(latest.modes[0]!.channels[0]).toMatchObject({ kind: 'control', name: 'Channel' });
    await user.selectOptions(screen.getByLabelText('Kind of channel 1'), 'fine');
    // No other control channel to belong to.
    expect(latest.modes[0]!.channels[0]).toMatchObject({ kind: 'fine', of: '', byte: 1 });
    await user.selectOptions(screen.getByLabelText('Kind of channel 3'), 'fine');
    expect(latest.modes[0]!.channels[2]).toMatchObject({ kind: 'fine', name: 'Channel', of: '' });
  });

  it('takes the first other control channel for a new fine channel', async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText('Kind of channel 3'), 'fine');
    expect(latest.modes[0]!.channels[2]).toMatchObject({ kind: 'fine', of: 'Dimmer' });
  });

  it('sets the coarse channel and byte of a fine channel', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add channel' }));
    await user.selectOptions(screen.getByLabelText('Coarse channel of channel 2'), 'Channel 4');
    expect(latest.modes[0]!.channels[1]).toMatchObject({ of: 'Channel 4' });
    await user.selectOptions(screen.getByLabelText('Byte of channel 2'), '2');
    expect(latest.modes[0]!.channels[1]).toMatchObject({ byte: 2 });
  });

  it('keeps a missing coarse channel as an option', () => {
    const profile = base();
    profile.modes[0]!.channels[1] = {
      kind: 'fine',
      name: 'F',
      of: 'Gone',
      byte: 1,
      defaultValue: 0,
    };
    setup({ profile });
    expect(screen.getByRole('option', { name: 'Gone' })).toBeTruthy();
  });

  it('shows a held hint for an unsupported range', () => {
    setup({ profile: control({ type: 'unsupported', feature: 'Prism' }) });
    expect(screen.getByText('held at default')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'unsupported' })).toBeTruthy();
  });
});

describe('ranges', () => {
  it('adds, edits and removes ranges', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Add range' }));
    const ranges = () => {
      const channel = latest.modes[0]!.channels[0]!;
      return channel.kind === 'control' ? channel.ranges : [];
    };
    expect(ranges()).toHaveLength(2);
    await user.clear(screen.getByLabelText('Start of channel 1 range 1'));
    await user.type(screen.getByLabelText('Start of channel 1 range 1'), '5');
    await user.clear(screen.getByLabelText('End of channel 1 range 1'));
    await user.type(screen.getByLabelText('End of channel 1 range 1'), '9');
    expect(ranges()[0]).toMatchObject({ from: 5, to: 9 });
    await user.click(screen.getByRole('button', { name: 'Remove channel 1 range 2' }));
    expect(ranges()).toHaveLength(1);
  });

  it('replaces the capability with the default of the chosen type', async () => {
    const user = setup();
    const pick = (type: string) =>
      user.selectOptions(screen.getByLabelText('Capability of channel 1 range 1'), type);
    await pick('emitter');
    expect(capabilityOf()).toEqual({ type: 'emitter', emitter: 'red' });
    await pick('wheelSlot');
    expect(capabilityOf()).toEqual({
      type: 'wheelSlot',
      slot: { name: 'Open', colour: '#ffffff' },
    });
    await pick('shutter');
    expect(capabilityOf()).toEqual({ type: 'shutter', effect: 'open' });
    await pick('none');
    expect(capabilityOf()).toEqual({ type: 'none' });
    await pick('pan');
    expect(capabilityOf()).toEqual({ type: 'pan' });
  });
});

describe('capability fields', () => {
  it('sets an intensity span from either end and clears it', async () => {
    const user = setup({ profile: control({ type: 'intensity', assumed: true } as Capability) });
    const start = screen.getByLabelText('Level of channel 1 range 1, start');
    const end = screen.getByLabelText('Level of channel 1 range 1, end');
    fireEvent.change(start, { target: { value: '0.2' } });
    expect(capabilityOf()).toMatchObject({ level: [0.2, 0.2] });
    expect(capabilityOf()).not.toHaveProperty('assumed');
    fireEvent.change(end, { target: { value: '0.8' } });
    expect(capabilityOf()).toMatchObject({ level: [0.2, 0.8] });
    await user.clear(start);
    expect(capabilityOf()).toMatchObject({ level: undefined });
  });

  it('starts a span from the end field', async () => {
    const user = setup({ profile: control({ type: 'strobe' }) });
    await user.type(screen.getByLabelText('Hz of channel 1 range 1, end'), '5');
    expect(capabilityOf()).toMatchObject({ hz: [5, 5] });
  });

  it('rejects text that is not a number', async () => {
    const user = setup({ profile: control({ type: 'strobeSpeed' }) });
    await user.type(screen.getByLabelText('Hz of channel 1 range 1, start'), 'x');
    expect(capabilityOf()).not.toHaveProperty('hz');
  });

  it('edits an emitter', async () => {
    const user = setup({ profile: control({ type: 'emitter', emitter: 'red' }) });
    await user.selectOptions(screen.getByLabelText('Emitter of channel 1 range 1'), 'green');
    expect(capabilityOf()).toMatchObject({ emitter: 'green' });
    await user.type(screen.getByLabelText('Level of channel 1 range 1, start'), '1');
    expect(capabilityOf()).toMatchObject({ level: [1, 1] });
  });

  it('edits a wheel slot name and colour', async () => {
    const user = setup({
      profile: control({ type: 'wheelSlot', slot: { name: 'Open', colour: '#ffffff' } }),
    });
    await user.clear(screen.getByLabelText('Slot name of channel 1 range 1'));
    await user.type(screen.getByLabelText('Slot name of channel 1 range 1'), 'Red');
    expect(capabilityOf()).toMatchObject({ slot: { name: 'Red' } });
    fireEvent.change(screen.getByLabelText('Slot colour of channel 1 range 1'), {
      target: { value: '#ff0000' },
    });
    expect(capabilityOf()).toMatchObject({ slot: { colour: '#ff0000' } });
  });

  it.each([
    ['pan', 'Degrees', 'degrees'],
    ['tilt', 'Degrees', 'degrees'],
    ['panTiltSpeed', 'Speed', 'speed'],
  ] as const)('edits the span of %s', async (type, label, key) => {
    const user = setup({ profile: control({ type }) });
    await user.type(screen.getByLabelText(`${label} of channel 1 range 1, start`), '1');
    expect(capabilityOf()).toMatchObject({ [key]: [1, 1] });
  });

  it('edits a shutter effect', async () => {
    const user = setup({ profile: control({ type: 'shutter', effect: 'open' }) });
    await user.selectOptions(screen.getByLabelText('Shutter of channel 1 range 1'), 'closed');
    expect(capabilityOf()).toMatchObject({ effect: 'closed' });
  });

  it('edits the feature of an unsupported range', async () => {
    const user = setup({ profile: control({ type: 'unsupported', feature: '' }) });
    await user.type(screen.getByLabelText('Feature of channel 1 range 1'), 'Prism');
    expect(capabilityOf()).toMatchObject({ feature: 'Prism' });
  });

  it('has no fields for none', () => {
    setup({ profile: control({ type: 'none' }) });
    expect(screen.queryByLabelText(/start$/)).toBeNull();
  });
});
