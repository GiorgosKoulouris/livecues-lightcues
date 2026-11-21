import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { MidiNote, Show } from '../../../shared/show';
import { Button, IconButton } from '../ui/Button';
import { parseName, TextField } from '../ui/fields';
import { removedMessage } from '../ui/removed';
import { SortableList } from '../ui/SortableList';
import { useToast } from '../ui/Toast';
import { NoteFields } from './NoteFields';
import styles from './PresetPanel.module.css';
import { freeId } from './scenes';
import { useMidiLearn } from './useMidiInput';

// The stylesheet class that lays out each kind of field cells.
const ITEM_VARIANT = { 2: 'wide', colours: 'colours' } as const;

// A Show's list of one kind of Preset, in order: each has a name, its own
// fields, and an optional MIDI note, typed in or learned. House Presets, Haze
// Presets and Colour Sets share it.
export function PresetPanel<P extends { id: string; name: string; note?: MidiNote }>({
  show,
  presets,
  label,
  idPrefix,
  max,
  hint,
  emptyText,
  fieldColumns,
  newPreset,
  renderFields,
  onPut,
  onMove,
  onRemove,
}: {
  show: Show;
  presets: P[];
  // The kind of Preset, such as "House Preset".
  label: string;
  // What its ids start with.
  idPrefix: string;
  max: number;
  hint: ReactNode;
  emptyText: string;
  // How many of its own fields `renderFields` gives, between name and note: one
  // or two cells, or 'colours' for a wide cell and then one.
  fieldColumns: 1 | 2 | 'colours';
  // A new Preset with this id and name.
  newPreset(id: string, name: string): P;
  renderFields(preset: P): ReactNode;
  onPut(preset: P): void;
  onMove(id: string, to: number): void;
  // Resolves to whether it was removed.
  onRemove(id: string): Promise<boolean>;
}) {
  const toast = useToast();
  const headingId = useId();
  // The Preset whose note the next one played sets.
  const [learningId, setLearningId] = useState<string>();
  const learning = presets.find((p) => p.id === learningId);

  useMidiLearn(learning !== undefined, (note) => {
    if (learning) onPut({ ...learning, note });
    setLearningId(undefined);
  });

  function add() {
    let n = presets.length + 1;
    while (presets.some((p) => p.name === `${label} ${n}`)) n++;
    onPut(newPreset(freeId(idPrefix, presets), `${label} ${n}`));
  }

  async function remove({ id, name }: P) {
    if (!(await onRemove(id))) return;
    toast({ message: removedMessage(name) });
  }

  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <div className={styles.bar}>
        <h3 id={headingId} className={styles.heading}>
          {label}s
        </h3>
        <Button icon={<Plus />} disabled={presets.length >= max} onClick={add}>
          Add {label}
        </Button>
      </div>
      <p className={styles.hint}>{hint}</p>
      {presets.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <SortableList
          label={`${label}s`}
          items={presets}
          getKey={(p) => p.id}
          itemLabel={(p) => p.name}
          onMove={(from, to) => onMove(presets[from]!.id, to)}
          itemClassName={
            fieldColumns === 1
              ? styles.item
              : `${styles.item} ${styles[ITEM_VARIANT[fieldColumns]]}`
          }
          renderItem={(preset, _, handle) => (
            <>
              {handle}
              <TextField
                label={`Name of ${preset.name}`}
                hideLabel
                value={preset.name}
                parse={parseName}
                onCommit={(name) => onPut({ ...preset, name })}
              />
              {renderFields(preset)}
              <NoteFields
                preset={preset}
                learning={preset.id === learningId}
                onLearn={(on) => setLearningId(on ? preset.id : undefined)}
                onPut={onPut}
                show={show}
              />
              <IconButton
                icon={<Trash2 />}
                label={`Remove ${label} ${preset.name}`}
                onClick={() => void remove(preset)}
              />
            </>
          )}
        />
      )}
    </section>
  );
}
