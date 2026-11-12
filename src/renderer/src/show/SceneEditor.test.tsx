import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rule, Scene, Show } from '../../../shared/show';
import { emptyPatch } from '../../../shared/venue-patch';
import { UiProvider } from '../ui/UiProvider';
import { SceneEditor } from './SceneEditor';

afterEach(cleanup);

const SHOW: Show = {
  layers: [
    { id: 'layer-1', name: 'Base' },
    { id: 'layer-2', name: 'Accents' },
  ],
  scenes: [],
  triggers: [],
  baseLook: undefined,
  panelScenes: [],
} as unknown as Show;

const scene = (rules: Rule[] = []): Scene => ({
  id: 'warm',
  name: 'Warm',
  tags: ['verse'],
  layer: 'layer-1',
  fadeIn: 0,
  rules,
});

let latest: Scene;
let accept = true;

function Harness({ initial, onGo, onRemove }: { initial: Scene; onGo(): void; onRemove(): void }) {
  const [current, setCurrent] = useState(initial);
  return (
    <SceneEditor
      scene={current}
      show={SHOW}
      patch={emptyPatch({ width: 10, depth: 6 })}
      bpm={120}
      onPut={async (next) => {
        if (!accept) return false;
        latest = next;
        setCurrent(next);
        return true;
      }}
      onGo={onGo}
      onRemove={onRemove}
    />
  );
}

function setup(rules: Rule[] = []) {
  accept = true;
  latest = scene(rules);
  const onGo = vi.fn();
  const onRemove = vi.fn();
  render(
    <UiProvider>
      <Harness initial={scene(rules)} onGo={onGo} onRemove={onRemove} />
    </UiProvider>,
  );
  return { onGo, onRemove, user: userEvent.setup() };
}

const card = (n: number) =>
  screen.getByRole('heading', { name: `Rule ${n}` }).closest('li') as HTMLElement;

describe('header', () => {
  it('renames, retags, moves layer and sets the fade', async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Cool');
    expect(latest.name).toBe('Cool');
    await user.clear(screen.getByLabelText('Tags'));
    await user.type(screen.getByLabelText('Tags'), 'a, b');
    expect(latest.tags).toEqual(['a', 'b']);
    await user.selectOptions(screen.getByLabelText('Layer'), 'Accents');
    expect(latest.layer).toBe('layer-2');
    await user.clear(screen.getByLabelText('Fade-in (s)'));
    await user.type(screen.getByLabelText('Fade-in (s)'), '1.5');
    expect(latest.fadeIn).toBe(1.5);
  });

  it('rejects an empty name', async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText('Name'));
    expect(latest.name).toBe('Warm');
  });

  it('goes and removes', async () => {
    const { user, onGo, onRemove } = setup();
    await user.click(screen.getByRole('button', { name: 'Go' }));
    await user.click(screen.getByRole('button', { name: 'Remove Scene' }));
    expect(onGo).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('rules', () => {
  it('says so without Rules, and adds one', async () => {
    const { user } = setup();
    expect(screen.getByText(/No Rules/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add Rule' }));
    expect(latest.rules).toEqual([{ target: {}, intensity: 1 }]);
    expect(card(1)).toBeTruthy();
  });

  it('removes a Rule and confirms', async () => {
    const { user } = setup([{ target: {} }, { target: {}, intensity: 0.5 }]);
    await user.click(screen.getByRole('button', { name: 'Remove Rule 1' }));
    expect(latest.rules).toEqual([{ target: {}, intensity: 0.5 }]);
    expect(await screen.findByText('Removed Rule 1 from Warm')).toBeTruthy();
  });

  it('stays quiet when the removal is refused', async () => {
    const { user } = setup([{ target: {} }]);
    accept = false;
    await user.click(screen.getByRole('button', { name: 'Remove Rule 1' }));
    expect(screen.queryByText(/Removed Rule/)).toBeNull();
  });

  it('toggles and sets intensity', async () => {
    const { user } = setup([{ target: {} }]);
    await user.click(within(card(1)).getByLabelText('Intensity'));
    expect(latest.rules[0]).toMatchObject({ intensity: 1 });
    fireEvent.change(screen.getByLabelText('Rule 1 intensity'), { target: { value: '40' } });
    expect(latest.rules[0]).toMatchObject({ intensity: 0.4 });
    expect(screen.getByText('40%')).toBeTruthy();
    await user.click(within(card(1)).getByLabelText('Intensity'));
    expect(latest.rules[0]).not.toHaveProperty('intensity');
  });

  it('sets and clears direction and strobe', async () => {
    const { user } = setup([{ target: {} }]);
    await user.selectOptions(screen.getByLabelText('Direction'), 'Cross');
    expect(latest.rules[0]).toMatchObject({ direction: 'Cross' });
    await user.selectOptions(screen.getByLabelText('Direction'), 'Not set');
    expect(latest.rules[0]).not.toHaveProperty('direction');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Strobe' }), 'Fast (12 Hz)');
    expect(latest.rules[0]!.strobe).toBe('Fast');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Strobe' }), 'Not set');
    expect(latest.rules[0]).not.toHaveProperty('strobe');
  });

  it('sets a numeric strobe rate', async () => {
    const { user } = setup([{ target: {}, strobe: 'Off' }]);
    const select = screen.getByRole('combobox', { name: 'Strobe' }) as HTMLSelectElement;
    const option = [...select.options].find((o) => o.value === '0.5')!;
    await user.selectOptions(select, option);
    expect(latest.rules[0]!.strobe).toBe(0.5);
  });
});

describe('roles', () => {
  it('targets one Role, adds another in order, and cannot drop the last', async () => {
    const { user } = setup([{ target: {} }]);
    const roles = within(screen.getByRole('group', { name: /Roles/ }));
    await user.click(roles.getByLabelText('Strobe'));
    expect(latest.rules[0]!.target.roles).toEqual(['Strobe']);
    await user.click(roles.getByLabelText('Wash'));
    expect(latest.rules[0]!.target.roles).toEqual(['Wash', 'Strobe']);
    await user.click(roles.getByLabelText('Wash'));
    expect(latest.rules[0]!.target.roles).toEqual(['Strobe']);
    await user.click(roles.getByLabelText('Strobe'));
    expect(latest.rules[0]!.target.roles).toEqual(['Strobe']);
    await user.click(roles.getByRole('button', { name: 'Every Role' }));
    expect(latest.rules[0]!.target).not.toHaveProperty('roles');
  });
});

describe('zones', () => {
  it('targets a Zone and goes back to every Zone', async () => {
    const { user } = setup([{ target: {} }]);
    await user.click(within(card(1)).getByRole('checkbox', { name: /Front Centre Floor/ }));
    expect(latest.rules[0]!.target.zones).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Every Zone' }));
    expect(latest.rules[0]!.target).not.toHaveProperty('zones');
  });
});

describe('colour', () => {
  it('switches between colour and colour Effect', async () => {
    const { user } = setup([{ target: {}, colour: { hue: 0, saturation: 1 } }]);
    const group = within(screen.getByRole('group', { name: 'Colour or Colour Effect' }));
    expect(group.getByRole('button', { name: 'Colour' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(group.getByRole('button', { name: 'Colour Effect' }));
    expect(latest.rules[0]).not.toHaveProperty('colour');
    expect(group.getByRole('button', { name: 'Colour Effect' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Picking the shown mode again changes nothing.
    await user.click(group.getByRole('button', { name: 'Colour Effect' }));
    await user.click(group.getByRole('button', { name: 'Colour' }));
    expect(group.getByRole('button', { name: 'Colour' }).getAttribute('aria-pressed')).toBe('true');
  });
});
