import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureProfile } from '../../../shared/fixture-profile';
import { emptyPatch, zoneName, type PatchedFixture, type Zone } from '../../../shared/venue-patch';
import { ZonePicker } from './ZonePicker';

afterEach(cleanup);

const profile: FixtureProfile = {
  ...{ id: 'acme/par', manufacturer: 'Acme', model: 'Par', defaultRole: 'Wash' },
  modes: [{ name: '3ch', channels: [] }],
};
const par: PatchedFixture = {
  ...{ id: 'par-1', name: 'Par 1', profileId: 'acme/par', mode: '3ch' },
  ...{ universe: 1, address: 1, x: 0, y: 1, height: 0 },
};
const patch = { ...emptyPatch({ width: 10, depth: 6 }), fixtures: [par], profiles: [profile] };

const front: Zone = { row: 'Front', column: 'Centre', level: 'Floor' };
const upstage: Zone = { row: 'Upstage', column: 'Stage Left', level: 'Overhead' };

function setup(zones?: Zone[]) {
  const onChange = vi.fn();
  render(<ZonePicker patch={patch} zones={zones} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

const cell = (zone: Zone) => screen.getByRole('checkbox', { name: zoneName(zone) });

describe('ZonePicker', () => {
  it('draws a plan per level with every Zone picked when none are set', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Floor Zones' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Overhead Zones' })).toBeTruthy();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(24);
    expect(boxes.every((b) => b.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Every Zone' })).toBeNull();
    expect(screen.getByText(/every Zone; click one/)).toBeTruthy();
  });

  it('targets the clicked Zone alone while every Zone is targeted', async () => {
    const { onChange, user } = setup();
    await user.click(cell(front));
    expect(onChange).toHaveBeenCalledWith([front]);
  });

  it('adds an unpicked Zone', async () => {
    const { onChange, user } = setup([front]);
    expect(cell(upstage).getAttribute('aria-checked')).toBe('false');
    await user.click(cell(upstage));
    expect(onChange).toHaveBeenCalledWith([front, upstage]);
  });

  it('removes a picked Zone', async () => {
    const { onChange, user } = setup([front, upstage]);
    await user.click(cell(front));
    expect(onChange).toHaveBeenCalledWith([upstage]);
  });

  it('keeps the last Zone', async () => {
    const { onChange, user } = setup([front]);
    await user.click(cell(front));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('goes back to every Zone', async () => {
    const { onChange, user } = setup([front]);
    await user.click(screen.getByRole('button', { name: 'Every Zone' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
