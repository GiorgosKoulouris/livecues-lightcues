import {
  MAX_HAZE_PRESETS,
  showHazePresets,
  type HazePreset,
  type Show,
} from '../../../shared/show';
import { NumberField } from '../ui/fields';
import { toPercent } from '../ui/percent';
import { PresetPanel } from './PresetPanel';

// Seconds a new Haze Preset fades over, and its level.
const DEFAULT_FADE = 5;
const DEFAULT_LEVEL = 0.5;
const FADE_STEP = 0.5;

// The Show's Haze Presets in order: name, level, fade and an optional MIDI
// note, typed in or learned. Every Hazer follows the Preset, scaled by its
// own max output.
export function HazePresetPanel({
  show,
  onPut,
  onMove,
  onRemove,
}: {
  show: Show;
  onPut(preset: HazePreset): void;
  onMove(id: string, to: number): void;
  // Resolves to whether it was removed.
  onRemove(id: string): Promise<boolean>;
}) {
  return (
    <PresetPanel
      show={show}
      presets={showHazePresets(show)}
      label="Haze Preset"
      idPrefix="haze"
      max={MAX_HAZE_PRESETS}
      hint={`Up to ${MAX_HAZE_PRESETS}, in this order. Drag to reorder. A note does Go only. Haze Off is always there. Each Hazer scales the level by its max output.`}
      emptyText="No Haze Presets yet: add one for each haze level."
      fieldColumns={2}
      newPreset={(id, name) => ({ id, name, level: DEFAULT_LEVEL, fade: DEFAULT_FADE })}
      renderFields={(preset) => (
        <>
          <NumberField
            label={`Level of ${preset.name} (%)`}
            hideLabel
            value={toPercent(preset.level)}
            min={0}
            max={100}
            integer={false}
            onCommit={(percent) => onPut({ ...preset, level: percent / 100 })}
          />
          <NumberField
            label={`Fade of ${preset.name} (s)`}
            hideLabel
            value={preset.fade}
            min={0}
            integer={false}
            step={FADE_STEP}
            onCommit={(fade) => onPut({ ...preset, fade })}
          />
        </>
      )}
      onPut={onPut}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
}
