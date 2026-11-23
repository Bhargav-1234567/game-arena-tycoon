# Build & Boot integration audit

The earlier workshop implemented match-three and inventory rewards, but simplified important original features. This compares the integration with the local `../Games/BuildAndBoot` source; passing regression tests alone does not establish full original-game parity.

## Corrected features

| Feature | Integrated behavior |
| --- | --- |
| Hardware tiles | Original CSS silhouettes: CPU pins, RAM chips/contacts, twin-fan GPU, SSD contacts, power circuit and rotating fan. Accessible cell names remain. |
| Four-match power-up | Creates a line blaster. Matching it or hitting it clears its entire row and column, including chained specials. |
| Five-match power-up | Creates an RGB core. Activation clears all tiles of its own part type and chains other specials. |
| Resolution | Shows the real swap, matched cells, each cascade, special activations, clearing and surviving/new parts falling to their actual destinations. |
| GPU Render | Preview and clear a clipped 3×3 frame, then resolve specials and cascades. |
| CPU Chain | Choose a part type; process up to six randomly selected matching parts. Preview shows candidates; activation highlights the actual selected cells. |
| Free Move | Swap any two distinct unlocked tiles, including non-neighbors and swaps without a match. |
| Cooling Wave | Remove every heat hazard and pause virus growth for three normal moves. |
| Lifeline budget | Each spends one of its own charges and zero normal moves. Cancellation, invalid targeting and failed saves consume nothing. |
| Earning charges | Normal matches add 1 charge, or 2–3 for cascades. Every 6 points earns Free Move → CPU → Cooling → GPU using a persisted counter independent of score. |
| First-clear reward | Each level grants its original catalog booster once. Replays still earn inventory hardware without repeating this booster. |
| Hazards | Dust/heat clear on matches; cable/virus also clear beside matches. Cable blocks swaps. Virus spreads every third paid move. Art shows dust, hot borders, crossed cables and infected cells. |
| Guidance | Visible lifeline bay, previews, selected-system instructions, cancel controls, charge meter, hazard-pause counter, build tips, how-to-play and ten build paths. |
| Sound/accessibility | Match, power-up, lifeline and reward cues respect the shared mute setting. Reduced-motion mode skips animation delays. |

`python scripts/sync-puzzle-catalog.py ../Games/BuildAndBoot` imports the first twenty level definitions and ten build descriptions, then uses the original generation formula for levels 21–100. Creator-path names, hazards and counts replace earlier approximations.

## Source references

- `BuildAndBoot.Game/MatchBoard.cs`: matches, special expansion, boosters, gravity and hazards.
- `BuildAndBoot.Game/GameCatalog.cs`: levels, builds, tips and first-clear boosters.
- `BuildAndBoot.Web/Pages/Home.razor.cs`: lifeline rotation and component markup.
- `BuildAndBoot.Web/wwwroot/css/app.css`: component/hazard artwork.

The original project is read only. Adapted markup/styles live in `src/puzzle/presentation.ts` and `src/puzzle.css`. Gameplay remains TypeScript; no Blazor runtime is embedded.

## Saves and scope

Older saves retain diamonds, completed levels, inventory, attachments and their active board. A missing rotation counter starts at zero; previously missed first-clear boosters are not retroactively added. Active boards preserve their own hazard kind when corrected level definitions differ. Results are saved atomically before visual playback; closing during playback cannot spend twice.

The tycoon adaptation retains displayed inventory rewards, diamond reroll prices, PC attachment and sequential unlocks. The original standalone game's three-question gateways, separate PC showcase, advertising, PWA installation and standalone settings are not integrated. Build paths provide a progress selector rather than the standalone motherboard/PC showcase.

## Verification

Unit checks cover rules, visual-step accuracy, source catalog values, first-clear rewards, rotation, save rollback and legacy fields. Browser checks use real input for all four lifelines and for four/five matches followed by line/RGB activation. Deterministic setup boards are explicitly named seeded fixtures. Separate campaign tests play levels 1–6 normally. The gameplay recorder earns wins and parts through UI input without injecting boards or completion flags.

On 23 November 2026, 46 unit tests passed. All 36 regression browser cases passed, followed by 12 focused cases after the keyboard/legacy-guidance/rendering changes: eight repeated power-up cases and four new cases, for 40 distinct desktop/mobile cases overall. The focused effects run uses normal animation; the broader campaign suite also exercises reduced-motion mode.

The paused-background probe initially recorded 8,085 unnecessary WebGL draw calls during a 400 ms sample. After the fix, the draw count stays unchanged while the puzzle is paused, increases when resized, then resumes on closing the puzzle. This is a local diagnostic observation, not a cross-device performance benchmark.

```powershell
npm test
npm run build
npm run test:e2e
npm run test:e2e -- tests/browser/build-and-boot.spec.ts tests/browser/puzzle-input.spec.ts
```

The updated captioned walkthrough is `artifacts/gameplay/2026-11-23T10-25-40-424Z/Game_Arena_Tycoon_Gameplay.mp4` (5:15). From approximately 3:02 it shows the component artwork and all four lifelines. A real Free Move creates an RGB core, then GPU Render activates it. The recording asserts that all four systems were used and normal moves stayed 21 → 21; the evidence is saved beside the video in `lifeline-demonstration.json`. No board or completion flags were injected. The final production build opened without JavaScript/resource errors; the MP4 passed a complete decode and visual frame inspection.
