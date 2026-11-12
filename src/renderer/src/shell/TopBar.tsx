import type { ReactNode } from 'react';
import type { MidiInputStatus } from '../../../shared/protocol';
import { midiWarning } from '../show/useMidiInput';
import type { PlaybackState } from '../show/usePlayback';
import { Badge } from '../ui/Badge';
import { cx } from '../ui/cx';
import styles from './TopBar.module.css';
import { useEngineStatus, type EngineStatus } from './useEngineStatus';

// An open file: its path, if saved, and whether it has unsaved changes.
interface OpenFile {
  path?: string;
  unsaved: boolean;
}

interface TopBarProps {
  show: OpenFile | undefined;
  venue: OpenFile | undefined;
  playback: PlaybackState | undefined;
  midiInput: MidiInputStatus | undefined;
}

// The open files, Blind, the MIDI Input and the engine, visible from every
// view.
export function TopBar({ show, venue, playback, midiInput }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <h1 className={styles.title}>
        <span>LiveCues</span> <span className={styles.product}>LightCues</span>
      </h1>
      <FileName kind="Show" file={show} />
      <FileName kind="Venue Patch" file={venue} />
      <span className={styles.spacer} />
      {playback?.mode === 'blind' && (
        <Badge tone="warning" title="Nothing is sent to the rig, except Blackout">
          Blind
        </Badge>
      )}
      <MidiPill status={midiInput} />
      <EngineIndicator status={useEngineStatus()} />
    </header>
  );
}

function FileName({ kind, file }: { kind: string; file: OpenFile | undefined }) {
  return (
    <span className={styles.file} title={file?.path}>
      <span className={styles.kind}>{kind}</span>
      <span className={styles.name}>{fileName(file?.path)}</span>
      {file?.unsaved && (
        <span className={styles.unsaved} role="img" aria-label="unsaved changes" title="Unsaved" />
      )}
    </span>
  );
}

// The file's name without its folder, or "Untitled" before it is saved.
function fileName(path: string | undefined): string {
  if (path === undefined) return 'Untitled';
  return path.split(/[\\/]/).at(-1) ?? path;
}

// Red when the selected input is lost or failed to open: Triggers do not fire
// then.
function MidiPill({ status }: { status: MidiInputStatus | undefined }) {
  const warning = midiWarning(status);
  if (warning) {
    return (
      <Badge tone="danger" role="alert" title={warning}>
        MIDI {status?.state === 'failed' ? 'failed' : 'lost'}: {status?.selected}
      </Badge>
    );
  }
  if (!status) return <StateChip state="connecting">MIDI…</StateChip>;
  if (status.state === 'connected') {
    return (
      <StateChip state="live" title={`Listening to ${status.selected}`}>
        MIDI: {status.selected}
      </StateChip>
    );
  }
  return (
    <StateChip state="offline" title="Choose a MIDI Input in the Show view">
      No MIDI Input
    </StateChip>
  );
}

type ChipState = 'live' | 'connecting' | 'offline';

// A state chip: a disc when live, a ring when connecting (Legend Dim) or
// offline (Warn Amber), then the word.
function StateChip({
  state,
  title,
  role,
  children,
}: {
  state: ChipState;
  title?: string;
  role?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.chip, styles[state])} role={role} title={title}>
      {children}
    </span>
  );
}

const ENGINE_LABELS: Record<EngineStatus['state'], string> = {
  waiting: 'Engine starting…',
  running: 'Engine',
  notResponding: 'Engine not responding',
};

const ENGINE_CHIP: Record<EngineStatus['state'], ChipState> = {
  waiting: 'connecting',
  running: 'live',
  notResponding: 'offline',
};

function EngineIndicator({ status }: { status: EngineStatus }) {
  const label = ENGINE_LABELS[status.state];
  const detail =
    status.state === 'running'
      ? `Replied in ${status.roundTripMs} ms, up ${Math.round(status.uptimeMs / 1000)} s`
      : status.state === 'notResponding'
        ? 'No reply to the last ping'
        : 'Waiting for the first reply';
  return (
    <StateChip state={ENGINE_CHIP[status.state]} role="status" title={detail}>
      {label}
    </StateChip>
  );
}
