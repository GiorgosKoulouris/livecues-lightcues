import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FixtureLight } from '../../../shared/protocol';
import type { VisualiserHandover } from '../../../shared/visualiser-handover';
import type { VenuePatch } from '../../../shared/venue-patch';
import { subscribePreview } from '../show/usePreview';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { forgetCamera, rememberCamera, rememberedCamera, sameStage } from './cameraMemory';
import { handedOverHaze, setHandedOverHaze } from './handover';
import { buildScene, fixtureLooks, type CameraPose, type CameraPresetName } from './sceneModel';
import { createSceneRenderer, type Quality, type SceneRenderer } from './sceneRenderer';
import styles from './VisualiserView.module.css';

const PRESETS: { id: CameraPresetName | 'reset'; label: string }[] = [
  { id: 'foh', label: 'FOH' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
  { id: 'reset', label: 'Reset' },
];

// The rig in 3D: the stage, its surroundings and every Fixture's body, from a
// camera the mouse orbits, zooms and pans. Mounted only while shown, so
// nothing renders while hidden; the free camera is kept in `cameraMemory`.
// Starts the engine's preview while open and draws its lights straight into the
// scene, so no event re-renders React. `blind` shows the Blind badge.
export function VisualiserView({
  patch,
  blind = false,
  windowButton,
}: {
  patch: VenuePatch | undefined;
  blind?: boolean;
  windowButton?: WindowButton;
}) {
  if (!patch) return <p className={styles.empty}>Open a Venue Patch to see it here.</p>;
  return <Stage patch={patch} blind={blind} windowButton={windowButton} />;
}

// The toolbar's button that moves the Visualiser between its View and its own
// window: Detach in the View, Reattach in the window.
export interface WindowButton {
  label: 'Detach' | 'Reattach';
  onClick: () => void;
}

function Stage({
  patch,
  blind,
  windowButton,
}: {
  patch: VenuePatch;
  blind: boolean;
  windowButton: WindowButton | undefined;
}) {
  const renderer = useRef<SceneRenderer>(undefined);
  const model = useMemo(() => buildScene(patch), [patch]);
  const [failed, setFailed] = useState(false);
  // View-only, not saved: the Assume haze (none follows the Hazers) and the
  // quality.
  const [assumed, setAssumed] = useState<number | undefined>(handedOverHaze);
  const [quality, setQuality] = useState<Quality>('high');
  const [hover, setHover] = useState<{ name: string; x: number; y: number }>();
  // The model the renderer made on mount starts from, then the latest.
  const drawn = useRef(model);
  // What the renderer has been given, so the first effect run does not repeat
  // what `attach` did.
  const applied = useRef<{ model: typeof model; patch: VenuePatch }>(undefined);
  // What main holds for the other window to take over: the free camera and the
  // haze override. Sent as they change, so a window closing loses nothing.
  const handover = useRef<VisualiserHandover>({});
  const publish = useCallback(() => window.visualiserWindow.setState(handover.current), []);
  // The latest patch and engine lights, for events and for a patch change.
  const latest = useRef({ patch, lights: {} as Record<string, FixtureLight> });

  // Makes the renderer when the canvas's host mounts, frees it when it goes.
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host) return;
      let created: SceneRenderer;
      try {
        const stage = latest.current.patch.stage;
        created = createSceneRenderer(host, rememberedCamera(stage) ?? drawn.current.cameras.foh, {
          onCamera: (pose) => {
            const stage = latest.current.patch.stage;
            rememberCamera(pose, stage);
            handover.current = { ...handover.current, camera: { pose, stage } };
            publish();
          },
          onHover: setHover,
        });
      } catch {
        setFailed(true);
        return;
      }
      created.setModel(drawn.current);
      // Only the free camera moves with the Visualiser, never the default FOH
      // it opens on when there is none.
      const free = rememberedCamera(latest.current.patch.stage);
      handover.current = {
        ...handover.current,
        camera: free && { pose: free, stage: latest.current.patch.stage },
      };
      publish();
      applied.current = { model: drawn.current, patch: latest.current.patch };
      renderer.current = created;
      const unsubscribe = subscribePreview((lights, haze, house) => {
        latest.current.lights = lights;
        created.setHaze(haze);
        created.setHouse(house);
        created.setLooks(fixtureLooks(latest.current.patch, lights));
      });
      return () => {
        unsubscribe();
        created.dispose();
        renderer.current = undefined;
      };
    },
    [publish],
  );

  useEffect(() => {
    drawn.current = model;
    const before = applied.current;
    if (before?.model === model && before.patch === patch) return;
    const moved = before && !sameStage(before.patch.stage, patch.stage);
    latest.current.patch = patch;
    applied.current = { model, patch };
    const drawing = renderer.current;
    if (!drawing) return;
    drawing.setModel(model);
    drawing.setLooks(fixtureLooks(patch, latest.current.lights));
    // Other stage bounds: the free camera is no longer anyone's. Back to FOH,
    // which the renderer reports as the camera, so forget it after.
    if (moved) {
      drawing.setCamera(model.cameras.foh);
      forgetCamera();
      handover.current = { ...handover.current, camera: undefined };
      publish();
    }
  }, [model, patch, publish]);

  useEffect(() => renderer.current?.setAssumedHaze(assumed), [assumed]);
  useEffect(() => {
    handover.current = { ...handover.current, haze: assumed };
    publish();
    setHandedOverHaze(assumed);
    return () => setHandedOverHaze(undefined);
  }, [assumed, publish]);
  useEffect(() => renderer.current?.setQuality(quality), [quality]);

  const go = (id: CameraPresetName | 'reset') => {
    const pose: CameraPose = model.cameras[id === 'reset' ? 'foh' : id];
    renderer.current?.setCamera(pose);
  };

  if (failed) {
    return (
      <p role="alert" className={styles.empty}>
        The 3D view cannot start: WebGL is not available on this machine. The Preview in Show and
        Perform shows the same rig in 2D.
      </p>
    );
  }
  return (
    <div className={styles.view}>
      <div role="toolbar" aria-label="Camera" className={styles.toolbar}>
        {PRESETS.map(({ id, label }) => (
          <Button key={id} onClick={() => go(id)}>
            {label}
          </Button>
        ))}
        <div role="group" aria-label="Quality" className={styles.group}>
          {(['high', 'low'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={quality === value}
              className={cx(styles.option, quality === value && styles.picked)}
              onClick={() => setQuality(value)}
            >
              {value === 'high' ? 'High' : 'Low'}
            </button>
          ))}
        </div>
        <label className={styles.haze} title="Pretend the room has this much haze. Not saved.">
          <span>Assume haze</span>
          <input
            type="range"
            aria-label="Assume haze"
            min={0}
            max={100}
            value={Math.round((assumed ?? 0) * 100)}
            // A first pick at 0 is no change, so the pointer down sets it.
            onPointerDown={(e) => {
              if (assumed === undefined) setAssumed(Number(e.currentTarget.value) / 100);
            }}
            onChange={(e) => setAssumed(Number(e.target.value) / 100)}
          />
          <output className={styles.percent}>
            {assumed === undefined ? 'Off' : `${Math.round(assumed * 100)}%`}
          </output>
        </label>
        {assumed !== undefined && <Button onClick={() => setAssumed(undefined)}>Clear</Button>}
        {windowButton && (
          <Button className={styles.windowButton} onClick={windowButton.onClick}>
            {windowButton.label}
          </Button>
        )}
      </div>
      <div className={styles.stage}>
        <div ref={attach} className={styles.canvas} />
        {blind && (
          <div className={styles.badge}>
            <Badge tone="warning" title="Showing what the rig would show: nothing is sent to it">
              Blind
            </Badge>
          </div>
        )}
      </div>
      {hover && (
        <div
          role="tooltip"
          className={styles.hover}
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.name}
        </div>
      )}
    </div>
  );
}
