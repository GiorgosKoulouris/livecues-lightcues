import {
  MAX_HOUSE_PRESETS,
  showHousePresets,
  type HousePreset,
  type Show,
} from '../../../shared/show';
import { NumberField } from '../ui/fields';
import { PresetPanel } from './PresetPanel';

// Seconds a new House Preset fades over.
const DEFAULT_FADE = 2;
const FADE_STEP = 0.5;

// The Show's House Presets in order: name, fade and an optional
// MIDI note, typed in or learned. Each Venue Patch gives them their looks.
export function HousePresetPanel({
  show,
  onPut,
  onMove,
  onRemove,
}: {
  show: Show;
  onPut(preset: HousePreset): void;
  onMove(id: string, to: number): void;
  // Resolves to whether it was removed.
  onRemove(id: string): Promise<boolean>;
}) {
  return (
    <PresetPanel
      show={show}
      presets={showHousePresets(show)}
      label="House Preset"
      idPrefix="house"
      max={MAX_HOUSE_PRESETS}
      hint={`Up to ${MAX_HOUSE_PRESETS}, in this order. Drag to reorder. A note does Go only. Each Venue Patch sets their looks.`}
      emptyText="No House Presets yet: add one for each house look."
      fieldColumns={1}
      newPreset={(id, name) => ({ id, name, fade: DEFAULT_FADE })}
      renderFields={(preset) => (
        <NumberField
          label={`Fade of ${preset.name} (s)`}
          hideLabel
          value={preset.fade}
          min={0}
          integer={false}
          step={FADE_STEP}
          onCommit={(fade) => onPut({ ...preset, fade })}
        />
      )}
      onPut={onPut}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
}
