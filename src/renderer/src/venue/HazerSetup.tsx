import { Plus } from 'lucide-react';
import { useState } from 'react';
import { modeHasHaze, type FixtureProfile } from '../../../shared/fixture-profile';
import type { Show } from '../../../shared/show';
import { hazePresetsWithoutHazers } from '../../../shared/venue-check';
import { applyVenueEdit, type VenueEdit } from '../../../shared/venue-edit';
import { patchHazers, type Hazer, type VenuePatch } from '../../../shared/venue-patch';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { NumberField } from '../ui/fields';
import { toPercent } from '../ui/percent';
import { removedMessage } from '../ui/removed';
import { useToast } from '../ui/Toast';
import { AddFixtureDialog } from './AddFixtureDialog';
import { AddressedRow } from './AddressedRow';
// Shares the House setup's styles: it shows inside it.
import styles from './HouseSetup.module.css';

interface HazerSetupProps {
  patch: VenuePatch;
  // The open Show, for the Venue Check.
  show?: Show;
  // The Profile Library's Profiles.
  profiles: FixtureProfile[];
  // Resolves to whether the edit was made.
  change(edit: VenueEdit): Promise<boolean>;
}

// The patch's Hazers. Only Profiles with a haze channel are offered.
export function HazerSetup({ patch, show, profiles, change }: HazerSetupProps) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const hazers = patchHazers(patch);
  const unset = show ? hazePresetsWithoutHazers(show, patch) : [];

  async function remove(hazer: Hazer) {
    if (await change({ type: 'removeHazers', ids: [hazer.id] })) {
      toast({ message: removedMessage(hazer.name) });
    }
  }

  return (
    <section aria-label="Hazers" className={styles.section}>
      <h3 className={styles.heading}>Hazers</h3>
      <p className={styles.hint}>
        Haze machines. Every Hazer follows the Show&apos;s Haze Presets. Scenes, Blackout, the Grand
        Master, Freeze and Blind never reach them.
      </p>
      {unset.length > 0 && (
        <p className={styles.hint}>
          <Badge tone="warning">Not set up in this venue</Badge> Haze Presets{' '}
          {unset.map((p) => p.name).join(', ')} do nothing until a Hazer is added.
        </p>
      )}
      {hazers.length > 0 ? (
        <table aria-label="Hazers" className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Profile</th>
              <th>Mode</th>
              <th>Universe</th>
              <th>Address</th>
              <th>Max output (%)</th>
              <th>Fan level (%)</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {hazers.map((hazer) => (
              <HazerRow
                key={hazer.id}
                patch={patch}
                hazer={hazer}
                onPut={(next) => void change({ type: 'putHazer', hazer: next })}
                onRemove={() => void remove(hazer)}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>No Hazers yet.</p>
      )}
      <Button icon={<Plus />} className={styles.add} onClick={() => setAdding(true)}>
        Add Hazer
      </Button>
      <AddFixtureDialog
        title="Add Hazer"
        open={adding}
        onOpenChange={setAdding}
        patch={patch}
        profiles={profiles}
        modeFilter={modeHasHaze}
        onAdd={(fixture) =>
          change({ type: 'putHazer', hazer: { ...fixture, maxOutput: 1, fanLevel: 1 } })
        }
      />
    </section>
  );
}

// A Hazer's patch fields, then its max output and fan level.
function HazerRow({
  patch,
  hazer,
  onPut,
  onRemove,
}: {
  patch: VenuePatch;
  hazer: Hazer;
  onPut(hazer: Hazer): void;
  onRemove(): void;
}) {
  return (
    <AddressedRow
      patch={patch}
      fixture={hazer}
      check={(next) => applyVenueEdit(patch, { type: 'putHazer', hazer: next }, () => undefined)}
      profileOf={(profile) => ({ ...profile, modes: profile.modes.filter(modeHasHaze) })}
      onPut={onPut}
      onRemove={onRemove}
    >
      {(put) => (
        <>
          <td>
            <NumberField
              label={`Max output of ${hazer.name}`}
              hideLabel
              className={styles.percent}
              min={0}
              max={100}
              integer={false}
              value={toPercent(hazer.maxOutput)}
              onCommit={(percent) => put({ ...hazer, maxOutput: percent / 100 })}
            />
          </td>
          <td>
            <NumberField
              label={`Fan level of ${hazer.name}`}
              hideLabel
              className={styles.percent}
              min={0}
              max={100}
              integer={false}
              value={toPercent(hazer.fanLevel)}
              onCommit={(percent) => put({ ...hazer, fanLevel: percent / 100 })}
            />
          </td>
        </>
      )}
    </AddressedRow>
  );
}
