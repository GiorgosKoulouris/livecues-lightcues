import { Plus, Radio, X } from 'lucide-react';
import type { MidiNote, Show } from '../../../shared/show';
import { Button, IconButton } from '../ui/Button';
import { NumberField } from '../ui/fields';
import styles from './NoteFields.module.css';
import { freeNote, noteName } from './notes';

// A Preset's channel and note, or none; typed in or learned.
export function NoteFields<P extends { name: string; note?: MidiNote }>({
  show,
  preset,
  learning,
  onLearn,
  onPut,
}: {
  show: Show;
  preset: P;
  learning: boolean;
  onLearn(on: boolean): void;
  onPut(preset: P): void;
}) {
  const { name, note } = preset;
  const learn = (
    <Button
      variant="ghost"
      icon={<Radio />}
      aria-pressed={learning}
      aria-label={`Learn a note for ${name}`}
      onClick={() => onLearn(!learning)}
    >
      {learning ? 'Play a note…' : 'Learn'}
    </Button>
  );
  if (!note) {
    return (
      <div className={styles.note}>
        <span className={styles.none}>No note</span>
        {learn}
        <IconButton
          icon={<Plus />}
          label={`Add a note to ${name}`}
          onClick={() => onPut({ ...preset, note: freeNote(show) })}
        />
      </div>
    );
  }
  return (
    <div className={styles.note}>
      <NumberField
        label={`Channel of ${name}`}
        hideLabel
        className={styles.channel}
        value={note.channel}
        min={1}
        max={16}
        onCommit={(channel) => onPut({ ...preset, note: { ...note, channel } })}
      />
      <NumberField
        label={`Note of ${name}`}
        hideLabel
        className={styles.noteNumber}
        value={note.note}
        min={0}
        max={127}
        hint={noteName(note.note)}
        onCommit={(n) => onPut({ ...preset, note: { ...note, note: n } })}
      />
      {learn}
      <IconButton
        icon={<X />}
        label={`Clear the note of ${name}`}
        onClick={() => onPut(withoutNote(preset))}
      />
    </div>
  );
}

// `preset` with no note.
function withoutNote<P extends { note?: MidiNote }>(preset: P): P {
  const next = { ...preset };
  delete next.note;
  return next;
}
