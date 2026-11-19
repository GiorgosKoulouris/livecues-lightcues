// @vitest-environment jsdom
import { Mesh, MeshBasicMaterial, Raycaster, ShaderMaterial, Vector3, type Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLooks, createSceneRenderer, drawModel, fixtureAt } from './sceneRenderer';
import { BODY_SIZES, buildScene, type FixtureLook, type SceneModel } from './sceneModel';
import { emptyPatch } from '../../../shared/venue-patch';

// A stand-in for WebGL, which jsdom lacks; the rest of three.js is real.
const { fake, observeSpy, disconnectSpy, controlsDispose } = vi.hoisted(() => ({
  fake: { setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() },
  observeSpy: vi.fn(),
  disconnectSpy: vi.fn(),
  controlsDispose: vi.fn(),
}));
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  return {
    ...three,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setPixelRatio = vi.fn();
      setSize = fake.setSize;
      render = fake.render;
      dispose = fake.dispose;
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = new Vector3();
    enableDamping = false;
    maxPolarAngle = 0;
    update = vi.fn();
    addEventListener = vi.fn();
    dispose = controlsDispose;
  },
}));

const cameraPose = buildScene(emptyPatch({ width: 10, depth: 6 })).cameras.foh;

// The renderer needs WebGL, but hover is only raycasting over meshes.
const model: SceneModel = {
  ...buildScene(emptyPatch({ width: 10, depth: 6 })),
  bodies: [
    {
      id: 'a',
      name: 'Front PAR 1',
      kind: 'par',
      size: BODY_SIZES.par,
      position: { x: 0, y: 3, z: 5 },
      axis: -1,
      yaw: 0,
      yoke: 0,
      head: 0,
    },
  ],
};

// A ray from the audience, along the Fixture's beam to its body.
const ray = new Raycaster(new Vector3(0, -8, 4.9), new Vector3(0, 1, 0));

const look: FixtureLook = {
  id: 'a',
  yoke: 0,
  head: 0,
  colour: { red: 1, green: 1, blue: 1 },
  intensity: 1,
  cone: {
    origin: { x: 0, y: 2.7, z: 5 },
    direction: { x: 0, y: -1, z: 0 },
    length: 6,
    halfAngle: 12.5,
  },
  pool: {
    surface: 'floor',
    position: { x: 0, y: -3, z: 5 },
    normal: { x: 0, y: 1, z: 0 },
    radius: 1,
  },
};

describe('fixtureAt', () => {
  it('finds a Fixture behind a visible cone and pool', () => {
    const drawn = drawModel(model);
    applyLooks(drawn, [look], 0, false);
    drawn.group.updateMatrixWorld(true);
    expect(fixtureAt(drawn, ray)).toBe('Front PAR 1');
  });

  it('finds a Fixture behind a hidden cone and pool', () => {
    const drawn = drawModel(model);
    drawn.group.updateMatrixWorld(true);
    expect(fixtureAt(drawn, ray)).toBe('Front PAR 1');
  });

  it('finds nothing where the ray meets only the stage', () => {
    const drawn = drawModel(model);
    drawn.group.updateMatrixWorld(true);
    expect(fixtureAt(drawn, new Raycaster(new Vector3(3, -8, 4.9), new Vector3(0, 1, 0)))).toBe(
      undefined,
    );
  });
});

describe('applyLooks cone quality', () => {
  const coneOf = (drawn: ReturnType<typeof drawModel>) => drawn.fixtures.get('a')!.cone;

  it('scatters by the haze density in High', () => {
    const drawn = drawModel(model);
    applyLooks(drawn, [look], 0, false, { density: 0.4, quality: 'high' });
    const material = coneOf(drawn).material as ShaderMaterial;
    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.uniforms.uDensity!.value).toBe(0.4);
    applyLooks(drawn, [look], 0, false, { density: 0.9, quality: 'high' });
    expect(material.uniforms.uDensity!.value).toBe(0.9);
  });

  it('draws plain additive cones in Low, whatever the density', () => {
    const drawn = drawModel(model);
    applyLooks(drawn, [look], 0, false, { density: 0.1, quality: 'high' });
    applyLooks(drawn, [look], 0, false, { density: 0.1, quality: 'low' });
    const material = coneOf(drawn).material as MeshBasicMaterial;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    const opacity = material.opacity;
    applyLooks(drawn, [look], 0, false, { density: 1, quality: 'low' });
    expect(material.opacity).toBe(opacity);
  });
});

describe('createSceneRenderer', () => {
  const frames: FrameRequestCallback[] = [];
  let now = 0;
  let rendered: number[] = [];
  let failResize = false;

  beforeEach(() => {
    frames.length = 0;
    rendered = [];
    now = 0;
    failResize = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observeSpy;
        disconnect = disconnectSpy;
      },
    );
    fake.setSize.mockImplementation(() => {
      if (failResize) throw new Error('lost');
    });
    fake.render.mockImplementation((scene: Scene) => {
      scene.traverse((child) => {
        if (child instanceof Mesh && child.material instanceof ShaderMaterial) {
          rendered.push(child.material.uniforms.uDensity!.value as number);
        }
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Runs the pending frame at `time` ms.
  const frame = (time: number) => {
    now = time;
    frames.shift()?.(time);
  };

  const create = () => {
    const host = document.createElement('div');
    const created = createSceneRenderer(host, cameraPose, {
      onCamera: vi.fn(),
      onHover: vi.fn(),
    });
    created.setModel(model);
    created.setLooks([look]);
    return { created, host };
  };

  it('moves the haze density gradually after the scene sat idle', () => {
    const { created } = create();
    frame(0);
    // Settled at the minimum, so frames stop.
    expect(frames).toHaveLength(0);

    now = 600_000;
    created.setHaze(1);
    frame(600_000);
    expect(rendered.at(-1)).toBeLessThan(0.2);
    frame(605_000);
    expect(rendered.at(-1)).toBeGreaterThan(0.5);
    expect(rendered.at(-1)).toBeLessThan(0.9);
  });

  it('decays gradually after Assume haze is cleared from idle', () => {
    const { created } = create();
    created.setAssumedHaze(0.9);
    frame(0);
    expect(frames).toHaveLength(0);

    now = 600_000;
    created.setAssumedHaze(undefined);
    frame(600_000);
    expect(rendered.at(-1)).toBeGreaterThan(0.85);
    frame(610_000);
    expect(rendered.at(-1)).toBeGreaterThan(0.5);
    expect(rendered.at(-1)).toBeLessThan(0.8);
  });

  it('frees what it made when building throws partway', () => {
    failResize = true;
    const host = document.createElement('div');
    expect(() =>
      createSceneRenderer(host, cameraPose, { onCamera: vi.fn(), onHover: vi.fn() }),
    ).toThrow('lost');
    expect(fake.dispose).toHaveBeenCalled();
    expect(host.querySelector('canvas')).toBeNull();
    expect(disconnectSpy).toHaveBeenCalled();
    expect(controlsDispose).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
