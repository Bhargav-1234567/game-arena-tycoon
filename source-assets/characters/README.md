# Original lounge characters

These people are authored specifically for this repository. Their geometry, skeleton,
skin weights, facial features, embedded textures and animation curves are generated
from the original source in `create_characters.py`. It imports no character mesh,
animation, texture, rig, model-generation service or external asset pack.

## Rebuild

From the repository root, with Python 3.10 or later:

```powershell
python source-assets/characters/create_characters.py
npm test
npm run build
```

Only Python's standard library is required. Blender is not required. The generator
writes GLB files and a deterministic SHA-256 manifest into
`public/assets/models/characters/original/`.

## Edit the art

- `SPECS` defines the six fictional identities, heights, palettes and receptionist role.
- `make_body()` authors the shared limbs, hands and fingers, then calls
  `make_top()`, `make_bottoms()` and `make_shoes()` for interchangeable clothing.
- `make_head()` authors the head, facial planes, eyes, eyelids, brows, nose, lips and ears.
- `make_hair(style)` authors crops, side parts, quiffs, curls, bobs, ponytails,
  buns and braids. `make_glasses()` authors square and round acetate frames.
- `make_materials()` creates the cotton and facial-tone PNG maps procedurally, embeds
  them in the GLB, and assigns nonmetallic skin/fabric/hair materials.
- `make_rig()` defines 29 original joints. `pose()` authors the seven motion clips.

The full meshes are for portrait inspection. Files ending in `_game.glb` are the
lighter meshes used by the lounge and neighborhood. Both are built from the same
art definitions and share the same rig and animation contracts.

## Wardrobe contract

Each GLB includes separate skinned mesh nodes tagged with
`extras.customAppearance = { slot, option }`. The shared body is always visible;
runtime selects one hair/top/bottoms/shoes module and optional glasses, headwear and neckwear. The skin
and 29 joints are shared by all modules. `customHuman.appearanceOptions` and
`defaultAppearance` describe valid choices and the initial look. `AssetManager`
applies the defaults before caching; it clones materials before any instance is
randomized. Always call `applyCharacterAppearance()` rather than editing cached
materials or enabling all modules.

Keep generator option lists aligned with `CharacterAppearance.ts`; tests compare
every authored module with the runtime catalog. The manifest distinguishes total
stored triangles from the maximum rendered combination. Current game meshes render
at most 16,570 triangles per person.

`make_accessories()` attaches headwear to the head and scarves to the upper torso.
`make_skirt()` skins the waistband to the hips and blends the hem between the thighs.
Try Walk, SitDown and Gaming in the studio after changing a hem or its weights.

Customers and pedestrians randomize once when created. Receptionists keep their
navy blazer/chinos uniform with varied hair, footwear and glasses. People are
transient and their clothing is not part of the game save contract.

## Coordinate and motion contracts

Coordinates are metres, +Y up and +Z facing forward. Feet start at floor level;
do not apply the legacy `0.30` character scale. Heights range from 1.67 to 1.80 m.
The `customHuman` scene metadata supplies stride speed and furniture-fit dimensions.

The authored clips are `Idle`, `Walk`, `SitDown`, `Gaming`, `StandUp`, `Wave` and
`CheckIn`. Idle, walking and gaming loops have matching start/end poses. Walking
uses an explicit stance and swing curve, with cadence matched to movement speed.

`OriginalCharacterMotion.ts` fits hands to the desk and feet to the floor across
chair tiers. It restores authored joint rotations before each mixer update, then
applies furniture fitting; skipping that restore causes accumulated pose drift.
The customer approaches a clear side of the chair, sits, stands and walks clear
before releasing its PC reservation.

## Inspect

Open `/custom-characters.html` on the Vite server or production preview. Select any
person, animation and chair tier, inspect the face close up, and rotate the view.
Use **Random look** for a new combination or **Customize look** to set hairstyle,
clothing, shoes, glasses and seven colours separately.
The preview uses the detailed originals; the actual game uses their lighter versions.

Run `npx playwright test tests/browser/characters.spec.ts` for the art preview,
24 person/chair combinations in four rotations, and real customer lifecycle checks.
The browser checks reject requests for the retired imported human model paths.
