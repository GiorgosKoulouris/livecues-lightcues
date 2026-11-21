import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../engine/show-file';
import { loadVenueFile } from '../engine/venue-file';
import type { EngineSnapshot } from '../shared/protocol';
import { createSnapshotStore, snapshotFile } from './engine-snapshot';

const snapshot: EngineSnapshot = {
  show: {
    document: { layers: [{ id: 'layer-1', name: 'Layer 1' }], scenes: [], triggers: [] },
    unsaved: true,
  },
  venue: {
    document: {
      stage: { width: 12, depth: 9 },
      universes: [{ number: 1 }],
      fixtures: [],
      profiles: [],
    },
    path: 'C:/gigs/club.lcvenue',
    unsaved: false,
  },
  playback: {
    active: [],
    mode: 'monitor',
    grandMaster: 1,
    blackout: false,
    freeze: false,
    bpm: 120,
    tempoSource: 'default',
  },
  house: { look: {}, fired: { type: 'startup' } },
  haze: { type: 'preset', id: 'light' },
  midiInput: {},
};

describe('createSnapshotStore', () => {
  it('has no snapshot until every part has come', () => {
    const store = createSnapshotStore();

    store.merge({ type: 'snapshot', show: snapshot.show, venue: snapshot.venue });
    expect(store.latest()).toBeUndefined();

    store.merge({ type: 'snapshot', playback: snapshot.playback, midiInput: snapshot.midiInput });
    expect(store.latest()).toBeUndefined();

    store.merge({ type: 'snapshot', house: snapshot.house });
    expect(store.latest()).toBeUndefined();

    store.merge({ type: 'snapshot', haze: snapshot.haze });
    expect(store.latest()).toEqual(snapshot);
  });

  it('keeps the latest of each part', () => {
    const store = createSnapshotStore();
    store.merge({ type: 'snapshot', ...snapshot });

    store.merge({ type: 'snapshot', show: { ...snapshot.show, unsaved: false } });

    expect(store.latest()).toEqual({ ...snapshot, show: { ...snapshot.show, unsaved: false } });
  });

  it('keeps the latest haze part', () => {
    const store = createSnapshotStore();
    store.merge({ type: 'snapshot', ...snapshot });

    store.merge({ type: 'snapshot', haze: { type: 'off' } });

    expect(store.latest()).toEqual({ ...snapshot, haze: { type: 'off' } });
  });
});

describe('snapshotFile', () => {
  it('writes each document as a file that opens', () => {
    expect(loadShowFile(snapshotFile(snapshot, 'show'))).toEqual(snapshot.show.document);
    expect(loadVenueFile(snapshotFile(snapshot, 'venue'))).toEqual(snapshot.venue.document);
  });
});
