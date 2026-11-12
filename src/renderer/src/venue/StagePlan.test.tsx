import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureProfile } from '../../../shared/fixture-profile';
import { emptyPatch, type PatchedFixture, type VenuePatch } from '../../../shared/venue-patch';
import { FIXTURE_MARKER_RADIUS } from './pixelScale';
import { StagePlan, stageView } from './StagePlan';

const profile: FixtureProfile = {
  ...{ id: 'acme/par', manufacturer: 'Acme', model: 'Par', defaultRole: 'Wash' },
  modes: [{ name: '3ch', channels: [] }],
};

const par: PatchedFixture = {
  ...{ id: 'par-1', name: 'Par 1', profileId: 'acme/par', mode: '3ch' },
  ...{ universe: 1, address: 1, x: 0, y: 1, height: 0 },
};

// jsdom lays nothing out: give the plan a box.
function layOut(width: number, height: number) {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width, height }),
  );
}

afterEach(() => vi.restoreAllMocks());

function plan(stage: VenuePatch['stage'], { showLabels = true } = {}) {
  const patch = { ...emptyPatch(stage), fixtures: [par], profiles: [profile] };
  return (
    <StagePlan
      patch={patch}
      selectedIds={[]}
      showLabels={showLabels}
      onSelect={() => {}}
      onMove={async () => {}}
    />
  );
}

// The marker's radius on screen: its radius times the scale of its group,
// in metres, times the plan's pixels per metre.
function screenRadius(pxPerMetre: number): number {
  const marker = screen.getByTestId('plan-par-1').querySelector('circle')!;
  const scale = /scale\(([^)]+)\)/.exec(
    marker.closest('[transform*=scale]')!.getAttribute('transform')!,
  )![1];
  return Number(marker.getAttribute('r')) * Number(scale) * pxPerMetre;
}

describe('StagePlan', () => {
  it('draws Fixture markers the same size on screen, whatever the stage size', () => {
    // A 4 × 3 m stage shows 4 m wide (no margin) in the 704 px less the
    // label room: 150 px per metre.
    layOut(704, 2000);
    const { rerender } = render(plan({ width: 4, depth: 3 }));
    const small = screenRadius(150);

    // A 16 × 10 m stage shows 16 m wide: 600 / 16 px per metre.
    rerender(plan({ width: 16, depth: 10 }));
    const large = screenRadius(600 / 16);

    expect(small).toBeCloseTo(FIXTURE_MARKER_RADIUS);
    expect(large).toBeCloseTo(FIXTURE_MARKER_RADIUS);
  });

  it('keeps Fixture markers in place, in metres', () => {
    layOut(600, 2000);
    render(plan({ width: 4, depth: 3 }));
    expect(screen.getByTestId('plan-par-1')).toHaveAttribute(
      'transform',
      expect.stringMatching(/^translate\(0 -1\)/),
    );
  });

  it('shows the label of the dragged Fixture while labels are hidden', () => {
    layOut(600, 2000);
    render(plan({ width: 4, depth: 3 }, { showLabels: false }));
    const marker = screen.getByTestId('plan-par-1');
    expect(marker.querySelector('text')).toBeNull();

    // jsdom has no pointer capture or screen matrix.
    marker.setPointerCapture = () => {};
    const svg = screen.getByRole('img') as unknown as SVGSVGElement;
    svg.getScreenCTM = () => null;
    fireEvent.pointerDown(marker);
    expect(marker.querySelector('text')).toHaveTextContent('Par 1');
    fireEvent.pointerUp(marker);
    expect(marker.querySelector('text')).toBeNull();
  });
});

describe('StagePlan dragging', () => {
  // jsdom has no pointer capture, DOMPoint or screen matrix: the pointer is
  // read from `pointer`, in stage metres with y as SVG y.
  let pointer = { x: 0, y: 0 };

  function drawn(onSelect = vi.fn(), onMove = vi.fn(async () => {}), showLabels = true) {
    layOut(600, 2000);
    vi.stubGlobal(
      'DOMPoint',
      class {
        matrixTransform() {
          return pointer;
        }
      },
    );
    const patch = {
      ...emptyPatch({ width: 4, depth: 3 }),
      fixtures: [par],
      profiles: [profile],
    };
    render(
      <StagePlan
        patch={patch}
        selectedIds={[]}
        showLabels={showLabels}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );
    const marker = screen.getByTestId('plan-par-1');
    marker.setPointerCapture = () => {};
    const svg = screen.getByRole('img') as unknown as SVGSVGElement;
    svg.getScreenCTM = () => ({ inverse: () => ({}) }) as DOMMatrix;
    return { marker, onSelect, onMove };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('selects on pointer down and drops without a move', () => {
    pointer = { x: 0, y: -1 };
    const { marker, onSelect, onMove } = drawn();
    fireEvent.pointerDown(marker);
    expect(onSelect).toHaveBeenCalledWith('par-1', expect.anything());
    fireEvent.pointerUp(marker);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves a Fixture, snapped, and shows where it lands', async () => {
    pointer = { x: 0, y: -1 };
    const { marker, onMove } = drawn();
    fireEvent.pointerDown(marker);
    pointer = { x: 1.02, y: -2.01 };
    fireEvent.pointerMove(marker);
    expect(screen.getByText(/Par 1: x 1\.\d\d m, y 2\.\d\d m → /)).toBeTruthy();
    fireEvent.pointerUp(marker);
    expect(onMove).toHaveBeenCalledWith(
      'par-1',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), height: 0 }),
    );
    // Dropped: further moves are ignored until the engine answers.
    fireEvent.pointerMove(marker);
    fireEvent.pointerUp(marker);
    expect(onMove).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText(/Drag a Fixture to move it/)).toBeTruthy());
  });

  it('cancels a drag', () => {
    pointer = { x: 0, y: -1 };
    const { marker, onMove } = drawn();
    fireEvent.pointerDown(marker);
    pointer = { x: 1, y: -2 };
    fireEvent.pointerMove(marker);
    fireEvent.pointerCancel(marker);
    fireEvent.pointerUp(marker);
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText(/Drag a Fixture to move it/)).toBeTruthy();
  });

  it('ignores moves without a drag', () => {
    const { marker } = drawn();
    fireEvent.pointerMove(marker);
    expect(screen.getByText(/Drag a Fixture to move it/)).toBeTruthy();
  });

  it('only selects on a shift or ctrl click', () => {
    const { marker, onSelect, onMove } = drawn();
    fireEvent.pointerDown(marker, { shiftKey: true });
    fireEvent.pointerDown(marker, { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.pointerUp(marker);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('is a keyboard target', () => {
    layOut(600, 2000);
    const onKeyDown = vi.fn();
    render(
      <StagePlan
        patch={emptyPatch({ width: 4, depth: 3 })}
        selectedIds={[]}
        onSelect={() => {}}
        onMove={async () => {}}
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowUp' });
    expect(onKeyDown).toHaveBeenCalled();
  });
});

describe('stageView', () => {
  it('shows the stage and a 1 m Front row, with no margin', () => {
    // SVG y is -stage y: upstage at -3, the Front row's edge at 1.
    expect(stageView({ width: 4, depth: 3 })).toEqual({ x: -2, y: -3, width: 4, height: 4 });
  });

  it('grows to take in Fixtures outside the stage and the Front row', () => {
    const fixtures = [
      { x: 3, y: 1 },
      { x: 0, y: -2.5 },
      { x: -1, y: 4 },
    ];
    expect(stageView({ width: 4, depth: 3 }, fixtures)).toEqual({
      x: -2,
      y: -4,
      width: 5,
      height: 6.5,
    });
  });
});
