// The Perform view's Scene buttons. Pure, so it is testable without a DOM.
import type { Layer, Scene, Show } from '../../../shared/show';

export interface SceneButton {
  scene: Scene;
}

export interface LayerGroup {
  layer: Layer;
  scenes: SceneButton[];
}

// Every Scene, one group per Layer in Layer order, Scenes in Show order.
// Layers without Scenes are kept, so the groups match the Show's Layers.
export function layerGroups(show: Show): LayerGroup[] {
  return show.layers.map((layer) => ({
    layer,
    scenes: show.scenes.filter((scene) => scene.layer === layer.id).map((scene) => ({ scene })),
  }));
}
