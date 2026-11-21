import type { CSSProperties, ReactNode } from 'react';
import type { HazeFired, HeldColourSet, HouseFired, TempoSource } from '../../../shared/protocol';
import {
  beatsText,
  SLOTS,
  type ColourSet,
  type HazePreset,
  type HousePreset,
  type Scene,
  type Show,
} from '../../../shared/show';
import { colourCss } from '../show/colourCss';
import { isActive } from '../show/scenes';
import type { PlaybackState } from '../show/usePlayback';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import styles from './controls.module.css';
import { runPanelAction } from './usePanelKeys';
import { SHORTCUTS } from './shortcuts';
import type { TempoState } from './useTempo';

// The Fallback Panel's controls, shared by the top bar and the Perform view,
// which sizes them with `className`. The container sets `--wide-control`, the
// width of Blackout and the Grand Master fader. `compact` is the top bar's
// form: a normal-size button with its key in the tooltip, not printed on it.

interface ControlProps {
  show: Show;
  playback: PlaybackState;
  className?: string;
  compact?: boolean;
}

// The tooltip of a compact control, with its key.
const withKey = (name: string, key: string) => `${name} (${key})`;

// A shortcut key shown on a control.
export function Key({ children }: { children: ReactNode }) {
  return <kbd className={styles.key}>{children}</kbd>;
}

// Turns Blackout on or off. At rest a plain key with a red disc; engaged it is
// sunk, with a red outline and word.
export function BlackoutButton({ show, playback, className, compact }: ControlProps) {
  return (
    <Button
      size={compact ? 'md' : 'lg'}
      title={compact ? withKey('Blackout', SHORTCUTS.blackout) : undefined}
      variant={playback.blackout ? 'sunk' : 'secondary'}
      className={cx(styles.blackout, className)}
      aria-pressed={playback.blackout}
      onClick={() => runPanelAction({ type: 'blackout' }, show, playback)}
    >
      <span aria-hidden className={styles.disc} />
      <span className={styles.legend}>Blackout</span>
      {!compact && <Key>{SHORTCUTS.blackout}</Key>}
    </Button>
  );
}

// Turns Freeze on or off, which holds every movement Effect where it is.
// Engaged it is sunk with a Warn Amber outline and ring.
export function FreezeButton({ show, playback, className, compact }: ControlProps) {
  return (
    <Button
      size={compact ? 'md' : 'lg'}
      title={compact ? withKey('Freeze', SHORTCUTS.freeze) : undefined}
      className={cx(styles.freeze, className)}
      aria-pressed={playback.freeze}
      onClick={() => runPanelAction({ type: 'freeze' }, show, playback)}
    >
      {playback.freeze && <span aria-hidden className={styles.ring} />}
      <span className={styles.legend}>Freeze</span>
      {!compact && <Key>{SHORTCUTS.freeze}</Key>}
    </Button>
  );
}

// Goes to the Base Look, which clears every other Layer. Disabled until the
// Show has one.
export function BaseLookButton({ show, playback, className, compact }: ControlProps) {
  const baseLook = show.scenes.find((s) => s.id === show.baseLook);
  return (
    <Button
      size={compact ? 'md' : 'lg'}
      className={cx(styles.baseLook, className)}
      disabled={!baseLook}
      title={
        baseLook
          ? compact
            ? withKey(`Base Look: ${baseLook.name}`, SHORTCUTS.baseLook)
            : baseLook.name
          : 'Choose a Base Look in the Show view'
      }
      aria-pressed={baseLook ? isActive(playback.active, baseLook) : false}
      onClick={() => runPanelAction({ type: 'baseLook' }, show, playback)}
    >
      <span className={styles.name}>Base Look{baseLook && `: ${baseLook.name}`}</span>
      {!compact && <Key>{SHORTCUTS.baseLook}</Key>}
    </Button>
  );
}

// On a Scene button in Perform, while the Scene is
// active and the Speed limit slows it. The tooltip names the length it runs
// at.
export function SpeedLimitBadge({ scene, playback }: { scene: Scene; playback: PlaybackState }) {
  const length = isActive(playback.active, scene) ? playback.limited?.[scene.layer] : undefined;
  if (length === undefined) return null;
  return (
    <Badge tone="warning" title={`Speed limit: movement Effects run at ${beatsText(length)}`}>
      Limited
    </Badge>
  );
}

const TEMPO_SOURCES: Record<TempoSource, string | undefined> = {
  default: undefined,
  clock: 'Clock',
  held: 'Clock lost',
  tap: 'Tapped',
};

// Tap Tempo, showing the Tempo in whole BPM and whether it comes from the MIDI
// Clock, is held since the clock was lost, or comes from taps. Taps are sent
// as they come; the engine averages them.
export function TapTempoButton({
  tempo,
  className,
  compact,
}: {
  tempo: TempoState | undefined;
  className?: string;
  compact?: boolean;
}) {
  const source = tempo && TEMPO_SOURCES[tempo.source];
  return (
    <Button
      size={compact ? 'md' : 'lg'}
      title={compact ? withKey('Tap Tempo', SHORTCUTS.tapTempo) : undefined}
      className={cx(styles.tapTempo, className)}
      onClick={() => window.engine.send({ type: 'tapTempo' })}
    >
      <span className={styles.legend}>Tap</span>
      {!compact && <Key>{SHORTCUTS.tapTempo}</Key>}
      {tempo && <span className={styles.bpm}>{Math.round(tempo.bpm)} BPM</span>}
      {source && <span className={styles.source}>{source}</span>}
    </Button>
  );
}

// Scales every Fixture's intensity, 0–100%.
export function GrandMasterFader({
  playback,
  className,
  compact,
}: {
  playback: PlaybackState;
  className?: string;
  compact?: boolean;
}) {
  const keys = `${SHORTCUTS.grandMasterDown} ${SHORTCUTS.grandMasterUp}`;
  return (
    <label
      className={cx(styles.grandMaster, compact && styles.compactFader, className)}
      title={compact ? withKey('Grand Master', keys) : undefined}
    >
      <span className={styles.label}>Grand Master {!compact && <Key>{keys}</Key>}</span>
      <input
        type="range"
        style={{ '--fill': `${Math.round(playback.grandMaster * 100)}%` } as CSSProperties}
        min={0}
        max={1}
        step={0.01}
        value={playback.grandMaster}
        onChange={(e) =>
          window.engine.send({ type: 'setGrandMaster', level: Number(e.target.value) })
        }
      />
      <output className={styles.percent}>{Math.round(playback.grandMaster * 100)}%</output>
    </label>
  );
}

// Fires a House Preset. Pressed while it is the one fired last, during its
// fade too.
export function HousePresetButton({
  preset,
  fired,
  className,
}: {
  preset: HousePreset;
  fired: HouseFired | undefined;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      className={className}
      aria-pressed={fired?.type === 'preset' && fired.id === preset.id}
      onClick={() => window.engine.send({ type: 'fireHousePreset', id: preset.id })}
    >
      <span className={styles.name}>{preset.name}</span>
    </Button>
  );
}

// Takes every Hazer to 0 at once. It has no key. Pressed while it is the one
// fired last, and at launch.
export function HazeOffButton({
  fired,
  className,
}: {
  fired: HazeFired | undefined;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      className={className}
      aria-pressed={fired === undefined || fired.type === 'off'}
      onClick={() => window.engine.send({ type: 'hazeOff' })}
    >
      <span className={styles.name}>Haze Off</span>
    </Button>
  );
}

// Fires a Haze Preset. It has no key. Pressed while it is the one fired last,
// during its fade too.
export function HazePresetButton({
  preset,
  fired,
  className,
}: {
  preset: HazePreset;
  fired: HazeFired | undefined;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      className={className}
      aria-pressed={fired?.type === 'preset' && fired.id === preset.id}
      onClick={() => window.engine.send({ type: 'fireHazePreset', id: preset.id })}
    >
      <span className={styles.name}>{preset.name}</span>
    </Button>
  );
}

// Fires a Colour Set. It has no key. Pressed while it is the one held, during
// its crossfade too. Its three colours show on the button.
export function ColourSetButton({
  set,
  held,
  className,
}: {
  set: ColourSet;
  held: HeldColourSet | undefined;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      className={className}
      aria-pressed={held?.id === set.id}
      onClick={() => window.engine.send({ type: 'fireColourSet', id: set.id })}
    >
      <span className={styles.name}>{set.name}</span>
      <span aria-hidden className={styles.setSamples}>
        {SLOTS.map((slot) => (
          <span
            key={slot}
            className={styles.setSample}
            style={{ background: colourCss(set.colours[slot]) }}
          />
        ))}
      </span>
    </Button>
  );
}
