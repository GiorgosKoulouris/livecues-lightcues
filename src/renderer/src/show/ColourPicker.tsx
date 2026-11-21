import { KELVIN_RANGE, SWATCHES, type Colour, type Swatch } from '../../../shared/show';
import { Select } from '../ui/Select';
import styles from './ColourPicker.module.css';

type Kind = 'none' | 'swatch' | 'kelvin' | 'hue';

// Picks a swatch, a white in kelvin or a hue and saturation, or no colour, shown as `unset`.
// With `unset` null, a colour must be picked.
export function ColourPicker({
  label = 'Colour',
  unset = 'Not set',
  colour,
  onChange,
}: {
  label?: string;
  unset?: string | null;
  colour?: Colour;
  onChange(colour: Colour | undefined): void;
}) {
  const kind: Kind =
    colour === undefined
      ? 'none'
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
        ]}
        onChange={(value) => {
          if (value === 'none') onChange(undefined);
          else if (value === 'swatch') onChange({ swatch: 'White' });
          else if (value === 'kelvin') onChange({ kelvin: 3200 });
          else onChange({ hue: 0, saturation: 1 });
        }}
      />
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
