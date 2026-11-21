import { validateShow, type Colour, type Rule, type Show } from '../shared/show';

// The .lcshow file: a Show as versioned JSON. Version 2 added the default
// colour, version 3 the Fallback Panel's Scene buttons (dropped in version 8), version 4 Rule
// Directions, movement Effects and the Default Direction and version 5 House
// Presets, strobe and Effect slots; older files load without them. Version 5
// renamed a Rule's `effect` to `movementEffect`. Version 6 added Haze Presets.
// Version 7 added the Spreads Right→Left, Edges→Centre, Front→Back, Back→Front
// and Random, the movement shapes Fan and Figure-8, and an intensity Effect's
// width (Chase and Random): versions 1–6 load as they are, but may not have a
// width. Version 7 also added a Rule's prism and gobo. Version 8 dropped
// `panelScenes`: versions 1–7 still load, the field ignored and dropped, and a
// version-8 file that has it is rejected as an unknown field. Version 9 added a
// Scene's `fadeUnit` (seconds or beats): a Show saves as version 9 only when a
// Scene sets one, and older files load as seconds. Version 10 added the kelvin
// Colour: a Show saves as version 10 only when it uses one, and an older file
// that has one is rejected as an unknown field.

const VERSION = 10;
const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, VERSION];

interface ShowFile extends Show {
  version: number;
}

// Throws when the Show is invalid, so every saved file loads.
export function saveShowFile(show: Show): string {
  throwIfInvalid(validateShow(show));
  const usesFadeUnit = show.scenes.some((scene) => scene.fadeUnit !== undefined);
  const usesKelvin = JSON.stringify(show).includes('"kelvin":');
  const version = usesKelvin ? 10 : usesFadeUnit ? 9 : 8;
  const file: ShowFile = { version, ...show };
  return JSON.stringify(file);
}

// Throws when the file is of an unknown version, malformed, has fields the
// model lacks (such as Fixture ids or DMX values) or its Show is invalid.
export function loadShowFile(json: string): Show {
  const file = parse(json);
  if (typeof file !== 'object' || file === null) throw new Error('Invalid Show: not an object');
  const { version, ...show } = file as ShowFile;
  if (!VERSIONS.includes(version)) throw new Error(`Unsupported Show version: ${version}`);
  if (!hasParts(show)) {
    throw new Error('Invalid Show: layers, scenes and triggers are required');
  }
  if (show.housePresets !== undefined && !Array.isArray(show.housePresets)) {
    throw new Error('Invalid Show: housePresets must be a list');
  }
  if (show.hazePresets !== undefined && !Array.isArray(show.hazePresets)) {
    throw new Error('Invalid Show: hazePresets must be a list');
  }
  // Version 1–7 files may carry the retired Fallback Panel Scenes.
  const { panelScenes, ...current } = show as Show & { panelScenes?: unknown };
  void panelScenes;
  let upgraded: Show = current;
  throwIfInvalid(
    checkMalformed(() => {
      upgraded = version < 5 ? withMovementEffects(current) : current;
      return [...unknownFields(file as ShowFile), ...validateShow(upgraded)];
    }),
  );
  return upgraded;
}

// A Show from a file before version 5, its Rules' `effect` as `movementEffect`.
function withMovementEffects(show: Show): Show {
  const upgrade = ({ effect, ...rule }: Rule & { effect?: Rule['movementEffect'] }): Rule =>
    effect === undefined ? rule : { ...rule, movementEffect: effect };
  return {
    ...show,
    scenes: show.scenes.map((scene) => ({ ...scene, rules: scene.rules.map(upgrade) })),
  };
}

function throwIfInvalid(errors: string[]): void {
  if (errors.length > 0) throw new Error(['Invalid Show:', ...errors].join('\n'));
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid Show: ${(error as Error).message}`, { cause: error });
  }
}

// The checks assume every part has its fields; a file need not.
function checkMalformed(check: () => string[]): string[] {
  try {
    return check();
  } catch {
    return ['a Layer, Scene, Rule, Trigger, House Preset or Haze Preset is missing fields'];
  }
}

function hasParts(show: Partial<Show>): boolean {
  const { layers, scenes, triggers } = show;
  return [layers, scenes, triggers].every(Array.isArray);
}

// Every field in the file that the Show model does not have, by path.
function unknownFields(file: ShowFile): string[] {
  const found: string[] = [];
  const allow = (value: object, fields: string[], path: string) => {
    for (const key of Object.keys(value)) {
      if (!fields.includes(key)) found.push(`unknown field "${path}${key}"`);
    }
  };
  const allowColour = (colour: Colour, path: string) =>
    allow(
      colour,
      'swatch' in colour
        ? ['swatch']
        : 'kelvin' in colour && file.version >= 10
          ? ['kelvin']
          : ['hue', 'saturation'],
      path,
    );
  // The top-level fields each version added.
  const added = [
    ['version', 'layers', 'scenes', 'triggers', 'baseLook'],
    ['defaultColour'],
    [], // 3: panelScenes, handled below.
    ['defaultDirection'],
    ['housePresets'],
    ['hazePresets'],
    [], // 7: none at the top level; Effect fields are allowed below.
    [], // 8: none; it dropped panelScenes.
    [], // 9: none at the top level; a Scene's fadeUnit is allowed below.
    [], // 10: none at the top level; kelvin Colours are allowed below.
  ];
  const top = added.slice(0, file.version).flat();
  // Versions 1–7 may carry the retired panelScenes, which is dropped on load.
  allow(file, file.version < 8 ? [...top, 'panelScenes'] : top, '');
  // The Rule fields of each version, besides the target and colour.
  const ruleFields =
    file.version >= 5
      ? [
          'intensity',
          'direction',
          'strobe',
          'movementEffect',
          'intensityEffect',
          'colourEffect',
          ...(file.version >= 7 ? ['prism', 'gobo'] : []),
        ]
      : [['intensity'], [], [], ['direction', 'effect']].slice(0, file.version).flat();
  const movementField = file.version < 5 ? 'effect' : 'movementEffect';
  if (file.version !== 1 && file.defaultColour !== undefined) {
    allowColour(file.defaultColour, 'defaultColour.');
  }
  file.layers.forEach((layer, i) => allow(layer, ['id', 'name'], `layers[${i}].`));
  file.scenes.forEach((scene, i) => {
    const fadeUnit = file.version >= 9 ? ['fadeUnit'] : [];
    allow(scene, ['id', 'name', 'tags', 'layer', 'fadeIn', ...fadeUnit, 'rules'], `scenes[${i}].`);
    scene.rules.forEach(({ target, colour, ...rest }, j) => {
      const at = `scenes[${i}].rules[${j}].`;
      allow(rest, ruleFields, at);
      allow(target, ['zones', 'roles'], `${at}target.`);
      target.zones?.forEach((zone, k) => {
        allow(zone, ['row', 'column', 'level'], `${at}target.zones[${k}].`);
      });
      if (colour !== undefined) allowColour(colour, `${at}colour.`);
      const effects = rest as Record<string, unknown>;
      const allowEffect = (field: string, fields: string[]) => {
        const effect = effects[field];
        if (typeof effect === 'object' && effect !== null) allow(effect, fields, `${at}${field}.`);
      };
      if (file.version >= 4) allowEffect(movementField, ['shape', 'size', 'length', 'spread']);
      if (file.version >= 5) {
        allowEffect(
          'intensityEffect',
          ['shape', 'depth', 'length', 'spread'].concat(file.version >= 7 ? ['width'] : []),
        );
        allowEffect('colourEffect', ['shape', 'colours', 'length', 'spread']);
        // validateShow reports a list or colour of the wrong type.
        const colours: unknown = (effects.colourEffect as { colours?: unknown } | null)?.colours;
        if (Array.isArray(colours)) {
          colours.forEach((colour: unknown, k) => {
            if (typeof colour === 'object' && colour !== null) {
              allowColour(colour as Colour, `${at}colourEffect.colours[${k}].`);
            }
          });
        }
      }
    });
  });
  file.triggers.forEach((trigger, i) => {
    allow(trigger, ['channel', 'note', 'scene', 'mode'], `triggers[${i}].`);
  });
  if (file.version >= 5) {
    file.housePresets?.forEach(({ note, ...rest }, i) => {
      allow(rest, ['id', 'name', 'fade'], `housePresets[${i}].`);
      if (note !== undefined) allow(note, ['channel', 'note'], `housePresets[${i}].note.`);
    });
  }
  if (file.version >= 6) {
    file.hazePresets?.forEach(({ note, ...rest }, i) => {
      allow(rest, ['id', 'name', 'level', 'fade'], `hazePresets[${i}].`);
      if (note !== undefined) allow(note, ['channel', 'note'], `hazePresets[${i}].note.`);
    });
  }
  return found;
}
