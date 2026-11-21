import { Settings2 } from 'lucide-react';
import type { ShowEdit } from '../../../shared/show-edit';
import { DEFAULT_DIRECTION, DIRECTIONS, type Show } from '../../../shared/show';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { Select } from '../ui/Select';
import { ColourPicker } from './ColourPicker';
import styles from './ShowSettings.module.css';

// The Show-wide settings, in a popover from the view header: Base Look,
// Default Colour, Default Direction and Strobe cap.

// The Hz a Strobe cap can be set to; a Show's own cap is listed too.
const CAP_HZ = [1, 2, 4, 6, 8, 12];

export function ShowSettings({ show, onEdit }: { show: Show; onEdit(edit: ShowEdit): void }) {
  return (
    <Popover
      label="Show settings"
      align="end"
      trigger={<Button icon={<Settings2 />}>Show settings</Button>}
    >
      <div className={styles.settings}>
        <Select
          label="Base Look"
          value={show.baseLook ?? ''}
          options={[
            { value: '', label: 'None' },
            ...show.scenes.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(sceneId) => onEdit({ type: 'setBaseLook', sceneId: sceneId || undefined })}
        />
        <ColourPicker
          label="Default Colour"
          unset="White"
          colour={show.defaultColour}
          onChange={(colour) => onEdit({ type: 'setDefaultColour', colour })}
        />
        <Select
          label="Default Direction"
          value={show.defaultDirection ?? DEFAULT_DIRECTION}
          options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
          onChange={(direction) => onEdit({ type: 'setDefaultDirection', direction })}
        />
        <Select
          label="Strobe cap"
          value={show.strobeCap === undefined ? '' : String(show.strobeCap)}
          options={[
            { value: '', label: 'None' },
            ...[...new Set([...CAP_HZ, ...(show.strobeCap === undefined ? [] : [show.strobeCap])])]
              .sort((a, b) => a - b)
              .map((hz) => ({ value: String(hz), label: `${hz} Hz` })),
          ]}
          onChange={(hz) => onEdit({ type: 'setStrobeCap', ...(hz && { hz: Number(hz) }) })}
        />
      </div>
    </Popover>
  );
}
