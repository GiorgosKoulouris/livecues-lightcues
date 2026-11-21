import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '../../../shared/show';
import { ShowSettings } from './ShowSettings';

const show: Show = { layers: [{ id: 'l1', name: 'Layer 1' }], scenes: [], triggers: [] };

async function open(shown: Show) {
  const onEdit = vi.fn();
  render(<ShowSettings show={shown} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Show settings' }));
  return { onEdit, cap: await screen.findByRole('combobox', { name: 'Strobe cap' }) };
}

describe('Strobe cap setting', () => {
  it('sets the cap in Hz', async () => {
    const { onEdit, cap } = await open(show);

    await userEvent.selectOptions(cap, '4 Hz');

    expect(onEdit).toHaveBeenLastCalledWith({ type: 'setStrobeCap', hz: 4 });
  });

  it('clears the cap with None', async () => {
    const { onEdit, cap } = await open({ ...show, strobeCap: 4 });

    expect(cap).toHaveValue('4');
    await userEvent.selectOptions(cap, 'None');

    expect(onEdit).toHaveBeenLastCalledWith({ type: 'setStrobeCap' });
  });
});
