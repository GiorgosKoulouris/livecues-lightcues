import type { Show } from '../../../shared/show';
import type { PlaybackState } from '../show/usePlayback';
import {
  BaseLookButton,
  BlackoutButton,
  FreezeButton,
  GrandMasterFader,
  TapTempoButton,
} from './controls';
import styles from './FallbackPanel.module.css';
import type { TempoState } from './useTempo';

interface FallbackPanelProps {
  show: Show | undefined;
  playback: PlaybackState | undefined;
  tempo: TempoState | undefined;
}

// Manual control that needs no MIDI: Blackout, the Base Look, the Grand
// Master, Tap Tempo and Freeze, each with a keyboard shortcut (`usePanelKeys`)
// shown in its tooltip. A cluster in the top bar, which the Perform view
// replaces with its own controls. Nothing shows while the Show and playback
// load, so the bar does not shift.
export function FallbackPanel({ show, playback, tempo }: FallbackPanelProps) {
  if (!show || !playback) return null;
  return (
    <section aria-label="Fallback Panel" className={styles.cluster}>
      <BlackoutButton compact show={show} playback={playback} />
      <BaseLookButton compact show={show} playback={playback} className={styles.baseLook} />
      <GrandMasterFader compact playback={playback} />
      <TapTempoButton compact tempo={tempo} />
      <FreezeButton compact show={show} playback={playback} />
    </section>
  );
}
