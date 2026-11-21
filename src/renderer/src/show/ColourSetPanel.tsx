import {
  MAX_COLOUR_SETS,
  showColourSets,
  SLOTS,
  type ColourSet,
  type Show,
} from '../../../shared/show';
import { NumberField } from '../ui/fields';
import { colourCss } from './colourCss';
import { ColourPicker } from './ColourPicker';
import styles from './ColourSetPanel.module.css';
import { PresetPanel } from './PresetPanel';

// Seconds a new Colour Set fades over.
const DEFAULT_FADE = 2;
const FADE_STEP = 0.5;

// What a new Colour Set starts with: a Primary, a Secondary and a white Accent.
const NEW_COLOURS: ColourSet['colours'] = {
  Primary: { swatch: 'Blue' },
  Secondary: { swatch: 'Magenta' },
  Accent: { swatch: 'White' },
};

// The Show's Colour Sets in order: name, three Colours (Primary, Secondary and
// Accent), fade and an optional MIDI note, typed in or learned. Rules name a
// slot, and show the held Colour Set's colour for it.
export function ColourSetPanel({
  show,
  onPut,
  onMove,
  onRemove,
}: {
  show: Show;
  onPut(set: ColourSet): void;
  onMove(id: string, to: number): void;
  // Resolves to whether it was removed.
  onRemove(id: string): Promise<boolean>;
}) {
  return (
    <PresetPanel
      show={show}
      presets={showColourSets(show)}
      label="Colour Set"
      idPrefix="colour-set"
      max={MAX_COLOUR_SETS}
      hint={`Up to ${MAX_COLOUR_SETS}, in this order. Drag to reorder. A note does Go only. The first holds when the Show opens. A Rule can use a slot in place of a colour.`}
      emptyText="No Colour Sets yet: add one for each colour look."
      fieldColumns="colours"
      newPreset={(id, name) => ({ id, name, colours: NEW_COLOURS, fade: DEFAULT_FADE })}
      renderFields={(set) => (
        <>
          <div className={styles.slots}>
            {SLOTS.map((slot) => (
              <div key={slot} className={styles.slot}>
                <span
                  aria-hidden
                  className={styles.sample}
                  style={{ background: colourCss(set.colours[slot]) }}
                />
                <ColourPicker
                  label={`${slot} of ${set.name}`}
                  unset={null}
                  colour={set.colours[slot]}
                  onChange={(colour) => {
                    if (colour) onPut({ ...set, colours: { ...set.colours, [slot]: colour } });
                  }}
                />
              </div>
            ))}
          </div>
          <NumberField
            label={`Fade of ${set.name} (s)`}
            hideLabel
            value={set.fade}
            min={0}
            integer={false}
            step={FADE_STEP}
            onCommit={(fade) => onPut({ ...set, fade })}
          />
        </>
      )}
      onPut={onPut}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
}
