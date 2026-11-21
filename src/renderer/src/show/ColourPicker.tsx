import {
  isSlotRef,
  KELVIN_RANGE,
  SLOTS,
  SWATCHES,
  type Colour,
  type RuleColour,
  type Slot,
  type Swatch,
} from '../../../shared/show';
import { Select } from '../ui/Select';
import styles from './ColourPicker.module.css';

type Kind = 'none' | 'swatch' | 'kelvin' | 'hue' | 'slot';

type ColourPickerProps = {
  label?: string;
  unset?: string | null;
} & (
  | { slots?: false; colour?: Colour; onChange(colour: Colour | undefined): void }
  | { slots: true; colour?: RuleColour; onChange(colour: RuleColour | undefined): void }
);

// Picks a swatch, a white in kelvin or a hue and saturation, or no colour, shown as `unset`.
// With `unset` null, a colour must be picked. With `slots`, it may also pick
// a slot of the held Colour Set.
export function ColourPicker(props: ColourPickerProps) {
  const { label = 'Colour', unset = 'Not set', slots = false, colour } = props;
  // A picker without `slots` is given Colours and only ever sends Colours.
  const onChange = props.onChange as (colour: RuleColour | undefined) => void;
  const kind: Kind =
    colour === undefined
      ? 'none'
      : isSlotRef(colour)
        ? 'slot'
        : 'swatch' in colour
          ? 'swatch'
          : 'kelvin' in colour
            ? 'kelvin'
            : 'hue';
  return (
    <div className={styles.picker}>
      <Select<Kind>
        label={label}
        value={kind}
        options={[
          ...(unset === null ? [] : [{ value: 'none' as const, label: unset }]),
          { value: 'swatch', label: 'Swatch' },
          { value: 'kelvin', label: 'Colour temperature' },
          { value: 'hue', label: 'Hue and saturation' },
          ...(slots ? [{ value: 'slot' as const, label: 'Colour Set slot' }] : []),
        ]}
        onChange={(value) => {
          if (value === 'none') onChange(undefined);
          else if (value === 'swatch') onChange({ swatch: 'White' });
          else if (value === 'kelvin') onChange({ kelvin: 3200 });
          else if (value === 'slot') onChange({ slot: 'Primary' });
          else onChange({ hue: 0, saturation: 1 });
        }}
      />
      {colour && isSlotRef(colour) && (
        <Select<Slot>
          label="Slot"
          value={colour.slot}
          options={SLOTS.map((slot) => ({ value: slot, label: slot }))}
          onChange={(slot) => onChange({ slot })}
        />
      )}
      {colour && 'swatch' in colour && (
        <Select<Swatch>
          label="Swatch"
          value={colour.swatch}
          options={SWATCHES.map((swatch) => ({ value: swatch, label: swatch }))}
          onChange={(swatch) => onChange({ swatch })}
        />
      )}
      {colour && 'kelvin' in colour && (
        <div className={styles.hue}>
          <label className={styles.slider}>
            <span className={styles.label}>Kelvin</span>
            <input
              type="range"
              min={KELVIN_RANGE[0]}
              max={KELVIN_RANGE[1]}
              step={100}
              value={colour.kelvin}
              onChange={(e) => onChange({ kelvin: Number(e.target.value) })}
            />
          </label>
          <span className={styles.label}>{colour.kelvin} K</span>
        </div>
      )}
      {colour && 'hue' in colour && (
        <div className={styles.hue}>
          <label className={styles.slider}>
            <span className={styles.label}>Hue</span>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(colour.hue)}
              onChange={(e) => onChange({ ...colour, hue: Number(e.target.value) })}
            />
          </label>
          <label className={styles.slider}>
            <span className={styles.label}>Saturation</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(colour.saturation * 100)}
              onChange={(e) => onChange({ ...colour, saturation: Number(e.target.value) / 100 })}
            />
          </label>
          <span
            aria-hidden
            className={styles.sample}
            style={{ background: `hsl(${colour.hue} ${colour.saturation * 100}% 50%)` }}
          />
        </div>
      )}
    </div>
  );
}
