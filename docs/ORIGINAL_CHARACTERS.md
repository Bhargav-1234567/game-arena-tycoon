# Original Character Upgrade

## Delivered art and source

The active lounge now uses an original family of semi-realistic stylized people:
Aarav, Kabir, Rohan, Meera, Anaya and receptionist Isha. They have authored faces,
hair, clothing, hands, fingers, shoes, a 29-joint weighted rig and embedded
procedural fabric/face textures. Human skin, hair and clothing are nonmetallic.

Every human mesh, rig, texture and motion curve comes from
[`create_characters.py`](../source-assets/characters/create_characters.py).
No downloaded character model, rig, motion clip or character texture is used.
Existing imported furniture and environment assets retain their previous provenance.

Two versions of each person are generated from the same source:

| Version | Purpose | All modules stored | Maximum visible per person |
| --- | --- | --- | --- |
| `_game.glb` | Customers, receptionist and street pedestrians | 35,870–45,432 triangles | 15,514–16,570 triangles |
| `.glb` | Face and full-body art preview | 93,160–115,700 triangles | 42,664–44,944 triangles |

The game loads only the lighter human meshes. The detailed versions are available
in the separate [character studio](http://127.0.0.1:4174/custom-characters.html).
The studio supports every person, all seven animations, close facial inspection,
front/side views and all four existing chair tiers.

## Interchangeable wardrobe

Each arriving customer and street pedestrian gets independent choices once at
spawn. The look stays fixed throughout their visit. All modules share the same
weighted rig; unused modules are hidden. Material colours belong to each cloned
instance, so changing one person does not recolour another.

| Category | Original geometry options |
| --- | --- |
| Hair | Crop, side part, curls and bun; male quiff; female bob, ponytail and braid |
| Tops | Polo, striped T-shirt, contrast-sleeve shirt, hoodie, overshirt and blazer. Female characters can also wear a wrap blouse. |
| Bottoms | Jeans, chinos, cuffed joggers and shorts. Female characters can also wear A-line and pleated skirts. |
| Footwear | Sneakers, high-tops, boots, loafers |
| Glasses | None, square frames, round frames |
| Headwear | None, baseball cap, beanie, over-ear headphones |
| Neckwear | None, knit scarf, neckerchief |

NPCs have a 45% chance of headwear and an independent 25% chance of neckwear.
Meera, Anaya and Isha each have a contoured torso. The generator fits all seven tops and their front details to that character’s bust profile in both mesh detail levels.
Each skirt has a hip-weighted waistband, a hem that follows the thighs and fitted lining shorts.
Shirts, trousers, footwear, soles, hair, accents and frames have independent
colours. Receptionists retain navy blazers/chinos while varying hair, glasses,
shoes and their colours.

Use **Random look** in the studio, or **Customize look** to choose every module
and colour directly. These controls also work while an animation is playing.
`src/characters/CharacterAppearance.ts` owns runtime choices and validation.

## Integration

The shared catalog is `src/data/characters.ts`. Existing saved PC IDs, furniture,
inventory, diamonds and progression are unchanged; people are transient simulation
objects and require no save migration.

The original animation set covers idle breathing/blinking, walking, sitting down,
seated keyboard/mouse movement, standing up, waving and reception check-in. The
walking cadence follows each rig's authored stride. Customers use a clear side of
the chair and finish standing/exiting before releasing the PC.

`OriginalCharacterMotion.ts` fits the hips to the measured cushion heights
(0.373, 0.477, 0.407 and 0.504 m), keeps ankles at their floor-based height and fits
wrists to the keyboard/mouse surface. Taller chairs add a small forward lean.
The original standing scale is one; the retired uniform `0.30` scale is not used.

## Rebuild and verification

```powershell
python source-assets/characters/create_characters.py
npm test
npm run build
npx playwright test tests/browser/characters.spec.ts
python scripts/verify_models.py
# With the production preview already running on 4174:
node --experimental-strip-types scripts/verify-lounge-production.ts http://127.0.0.1:4174/
```

The asset manifest records file sizes, total and maximum active triangle counts,
per-slot geometry counts, wardrobe options, joint counts and SHA-256 hashes.
Tests validate binary/index bounds, finite geometry, normalized weights and
quaternions, human height, original-only human paths, seamless loops, reciprocal
sit/stand poses and planted walking feet. Browser fixtures exercise all six
people on all four chair tiers in four rotations, including repeated pose fitting.
Separate normal-game cases exercise actual customer arrival, gaming, payment,
standing and walking to the street exit.

Verified locally on 23 November 2026:

- All 75 unit tests and the TypeScript/Vite production build passed, including checks of garment clearance and accessory and skirt skin weights.
- All 102 referenced model paths exist, including both versions of each person.
- Wardrobe tests cover 2,000 seeded looks per gender, every style/colour option,
  independent material instances, repeated switching and invalid-choice rejection.
- All eight character browser checks passed across desktop and mobile Chromium:
  every wardrobe module, colour edits, randomization, independent cloned materials,
  all six people/seven poses, all chair tiers/rotations, and real randomized
  customers that pay once, stand and walk to the street exit. Screenshots were
  inspected for both genders in standing and seated poses.
- Production desktop/mobile smoke checks passed, including the compiled wardrobe
  controls and randomizer, a legal puzzle move, chair-placement rejection and
  technician save/reload. Both runs recorded no console/page errors or HTTP failures.

Local evidence is under `test-results/custom-characters/`, `test-results/playwright/`
and `test-results/production-lounge/`. Each production run writes a timestamped
`results.json`. The torso-fit screenshots show the wrap blouse, T-shirt, hoodie
and blazer in standing and seated poses. Mobile checks use Chromium device emulation.
