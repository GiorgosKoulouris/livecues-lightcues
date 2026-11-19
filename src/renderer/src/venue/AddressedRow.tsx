import { Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { FixtureProfile } from '../../../shared/fixture-profile';
import {
  patchProfile,
  type AddressedFixture,
  type PatchResult,
  type VenuePatch,
} from '../../../shared/venue-patch';
import { IconButton } from '../ui/Button';
import { parseName, TextField } from '../ui/fields';
import { Select } from '../ui/Select';
import { modeOptions, parseAddress, universeOptions } from './fixtures';
// Shares the House setup's styles: a Hazer row shows inside it.
import styles from './HouseSetup.module.css';

// The select fields whose change can make a fixture not fit. Their errors
// show below them.
type CheckedField = 'mode' | 'universe';

// The patch fields every House Light and Hazer has: name, Profile, mode,
// Universe and address, then `children` for its own, then remove. A choice
// that does not fit is not sent; its error shows inline. `children` gets the
// same checked `put`.
export function AddressedRow<F extends AddressedFixture>({
  patch,
  fixture,
  check,
  profileOf = (p) => p,
  onPut,
  onRemove,
  children,
}: {
  patch: VenuePatch;
  fixture: F;
  // The result of putting `next` into the patch, as the engine would.
  check(next: F): PatchResult;
  // The Profile as the mode select should offer it, such as narrowed to the
  // modes that fit.
  profileOf?(profile: FixtureProfile): FixtureProfile;
  onPut(next: F): void;
  onRemove(): void;
  children(put: (next: F) => void): ReactNode;
}) {
  const [errors, setErrors] = useState<Partial<Record<CheckedField, string>>>({});
  const profile = patchProfile(patch, fixture);

  // Checks a change against the patch first.
  function put(next: F, field?: CheckedField) {
    const result = check(next);
    if ('errors' in result && field) {
      setErrors({ [field]: result.errors.join(' ') });
      return;
    }
    setErrors({});
    onPut(next);
  }

  return (
    <tr>
      <td>
        <TextField
          label={`Name of ${fixture.name}`}
          hideLabel
          value={fixture.name}
          parse={parseName}
          onCommit={(name) => put({ ...fixture, name })}
        />
      </td>
      <td className={styles.profile}>
        {profile.manufacturer} {profile.model}
      </td>
      <td>
        <Select
          label={`Mode of ${fixture.name}`}
          hideLabel
          error={errors.mode}
          value={fixture.mode}
          options={modeOptions(profileOf(profile))}
          onChange={(mode) => put({ ...fixture, mode }, 'mode')}
        />
      </td>
      <td>
        <Select
          label={`Universe of ${fixture.name}`}
          hideLabel
          error={errors.universe}
          value={String(fixture.universe)}
          options={universeOptions(patch)}
          onChange={(universe) => put({ ...fixture, universe: Number(universe) }, 'universe')}
        />
      </td>
      <td>
        <TextField
          label={`Address of ${fixture.name}`}
          hideLabel
          mono
          className={styles.address}
          value={fixture.address}
          parse={(text) => parseAddress(patch, fixture, text)}
          onCommit={(address) => put({ ...fixture, address })}
        />
      </td>
      {children((next) => put(next))}
      <td className={styles.actions}>
        <IconButton icon={<Trash2 />} label={`Remove ${fixture.name}`} onClick={onRemove} />
      </td>
    </tr>
  );
}
