# Pixel District

The exterior connects the gaming lounge to a compact neighborhood. All features below are implemented on the current working branch; gameplay state remains in the same browser save as puzzle rewards and PC attachments.

## Completed stages

1. **World layout and asset scale.** The full six-wing property is reserved before neighbors are placed. `src/data/world-layout.ts` owns property bounds, landmark positions, doorway, sidewalk and bus routes. Imported city models are fitted to measured dimensions. Repeated tree crowns, trunks, windows and road markings use instanced geometry.
2. **A recognizable lounge.** Glass storefront, lounge name, opening-hours board, tournament poster, roof and illuminated roof trim. Three paid frontage upgrades add an awning, planters and flagship entrance lighting. Each adds two reputation points and improves visitor arrival frequency.
3. **Neighborhood locations.** A physical Build & Boot workshop opens the existing Puzzle Lab. Pixel Bites offers a one-time $750 partnership that adds five station satisfaction points. A bus shelter, visitor parking, bicycle stands, park, trees, benches, streetlights and neighboring shops establish the street.
4. **Two camera views.** Neighborhood overview and lounge management views transition smoothly. The roof, frontage, near walls and tree crowns hide in lounge view. Wheel, right-drag, touch pan, pinch and zoom buttons are supported. View selection is saved; a district guide provides accessible location buttons.
5. **Visible life and progression.** Moving traffic, ambient pedestrians and paying customers share the district. The Circuit Line arrives after 24 simulation seconds initially and every 60 seconds thereafter, stopping to bring up to three visitors. Customers cross at the zebra crossing and cars yield. Expansion updates the roof and includes a short construction transition.
6. **Neighborhood Cup.** Free entry; serve three paying customers within 120 simulation seconds to earn $500 and five reputation points. Completion is saved once per event. Plaza posters change for live events and winners. A new attempt can begin after a win or expiry. Puzzle and inventory dialogs pause the timer with the rest of the lounge.
7. **Lighting.** Day, evening and night presets change ambient/sun lighting, sky, fog and streetlights. The automatic cycle follows the game clock: day 07:00–17:00, evening 17:00–20:00, night otherwise. Evening is the initial artistic preset; the business stays open 24/7.

## State and compatibility

`NeighborhoodSystem` validates drafts and persists a full game snapshot before applying purchases or event prizes. Cash and reputation changes are saved with the associated neighborhood change. Existing version-1 and version-2 games gain defaults without changing PC IDs, parts, diamonds or puzzle progress. Stale tabs cannot overwrite newer progress.

`NeighborhoodScene` owns exterior meshes. `ExteriorEnvironmentSystem` preserves the existing import name. `NeighborhoodUI` provides map labels, camera/lighting controls and location panels. `CameraController`, `CustomerSystem`, `CollisionSystem` and `ExpansionSystem` use the shared layout.

## Testing and recording

```powershell
npm test
npm run build
python scripts/verify_models.py
npm run test:e2e
node --experimental-strip-types scripts/record-gameplay.ts
```

The model checker validates literal model URLs; interpolated URLs are exercised by browser resource checks. Browser tests include real bus crossing and paying-customer tournament completion, all six expansions, phone-sized map interaction, and the earlier puzzle/inventory suite.

The recorder uses isolated browser storage and normal UI actions, including genuine puzzle wins. It records a visible Chromium window with explanatory captions, saves a WebM and chapter timings under ignored `artifacts/gameplay/`, and checks that earned parts, event prizes and expansion state persist. No gameplay balances or completion flags are injected into the recording.

Validation on 23 November 2026: 46 unit tests and 40 distinct desktop/mobile browser cases passed, including native mouse pan/wheel and phone touch pan/pinch. TypeScript, the production build, all 98 literal model paths, and Git whitespace checks passed. See [BUILD_AND_BOOT_PARITY.md](BUILD_AND_BOOT_PARITY.md) for the regression/focused-run boundaries and corrected original puzzle features. The existing large-bundle warning remains.

The updated walkthrough is `artifacts/gameplay/2026-11-23T10-25-40-424Z/Game_Arena_Tycoon_Gameplay.mp4`: 5:15, 1600×1000, H.264 at 25 fps, approximately 12.9 MiB. Its 25 captioned sections cover the district, lighting, frontage, café, bus arrivals, tournament, puzzle rewards/diamond prices, two genuine puzzle wins, inventory and PC management, all four lifelines, real RGB creation/activation, build paths, six expansions, new stations, staff and reload recovery. The lifeline section begins around 3:02; `lifeline-demonstration.json` confirms all four systems were used while moves remained 21 → 21. This silent recording finished without browser errors, and the final production-build smoke check also reported none. The MP4 passed a full decode check; exported tile/CPU/GPU frames were visually inspected.

To encode another recording, install an FFmpeg build with libx264 and run `python scripts/encode-gameplay.py artifacts/gameplay/<run-folder> --ffmpeg <ffmpeg-path>`. Raw WebM, chapter timings and browser-error evidence remain beside the MP4; generated recordings stay outside Git.
