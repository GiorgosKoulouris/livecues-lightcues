import type { HazeFired, HouseFired } from '../../../shared/protocol';
import { showHazePresets, showHousePresets, type Show } from '../../../shared/show';
import { isActive } from '../show/scenes';
import type { PlaybackState } from '../show/usePlayback';
import { Button } from '../ui/Button';
import {
  BaseLookButton,
  BlackoutButton,
  FreezeButton,
  GrandMasterFader,
  HazeOffButton,
  HazePresetButton,
  HousePresetButton,
  Key,
  SpeedLimitBadge,
  TapTempoButton,
} from './controls';
import styles from './FallbackPanel.module.css';
import { runPanelAction } from './usePanelKeys';
import type { TempoState } from './useTempo';

interface FallbackPanelProps {
  show: Show | undefined;
  playback: PlaybackState | undefined;
  tempo: TempoState | undefined;
  house: HouseFired | undefined;
  haze: HazeFired | undefined;
}

// Manual control that needs no MIDI: Blackout, the Base Look, the Grand
// Master, Tap Tempo, Freeze, the Show's Scene buttons and its House Presets,
// each showing its keyboard shortcut (`usePanelKeys`), then Haze Off and the
// Haze Presets, which have none. Docked as a strip below
// every view but Perform. Blackout's key is sunk while it is on.
export function FallbackPanel({ show, playback, tempo, house, haze }: FallbackPanelProps) {
  if (!show || !playback) {
    return (
      <section aria-label="Fallback Panel" className={styles.strip}>
        <p className={styles.note}>Loading Fallback Panel…</p>
      </section>
    );
  }
  const scenes = (show.panelScenes ?? []).flatMap(
    (id) => show.scenes.find((s) => s.id === id) ?? [],
  );
  const housePresets = showHousePresets(show);
  const hazePresets = showHazePresets(show);

  return (
    <section aria-label="Fallback Panel" className={styles.strip}>
      <BlackoutButton show={show} playback={playback} />
      <BaseLookButton show={show} playback={playback} className={styles.baseLook} />
      <GrandMasterFader playback={playback} />
      <TapTempoButton tempo={tempo} />
      <FreezeButton show={show} playback={playback} />
      <div className={styles.scenes} role="group" aria-label="Scene buttons">
        {scenes.length === 0 ? (
          <p className={styles.note}>No Scene buttons: add them in the Show view.</p>
        ) : (
          scenes.map((scene, i) => (
            <Button
              key={scene.id}
              size="lg"
              aria-pressed={isActive(playback.active, scene)}
              onClick={() => runPanelAction({ type: 'scene', index: i }, show, playback)}
            >
              {scene.name} <SpeedLimitBadge scene={scene} playback={playback} />
              <Key>{i + 1}</Key>
            </Button>
          ))
        )}
      </div>
      {housePresets.length > 0 && (
        <div className={styles.presets} role="group" aria-label="House Preset buttons">
          {housePresets.map((preset, i) => (
            <HousePresetButton key={preset.id} preset={preset} index={i} fired={house} />
          ))}
        </div>
      )}
      {hazePresets.length > 0 && (
        <div className={styles.presets} role="group" aria-label="Haze Preset buttons">
          <HazeOffButton fired={haze} />
          {hazePresets.map((preset) => (
            <HazePresetButton key={preset.id} preset={preset} fired={haze} />
          ))}
        </div>
      )}
    </section>
  );
}
