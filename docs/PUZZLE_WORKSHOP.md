# Puzzle Workshop

Puzzle Lab adapts the hardware-themed match-three concept from the local .NET Build & Boot project. It runs inside the existing TypeScript game; no .NET runtime or external game service is required.

## Player flow

1. Open **Puzzle Lab** and start a puzzle. The lounge pauses while either workshop screen is open.
2. Match three adjacent hardware tiles to collect the target and clear all hazards before moves run out. Tap neighboring tiles, swipe, or use keyboard focus and Enter. Hints are free.
3. A win automatically saves one displayed part and five diamonds. Open **Inventory**, choose a PC and attach the part. Clicking a PC also opens its installed-part controls.
4. Detach returns the copy to inventory. Replace returns the previous copy and installs the chosen available copy in one operation. Moving or upgrading a PC retains its parts.

## Rules and initial balance

- New and migrated games receive 100 welcome diamonds. Every successful puzzle run earns five more. There are no purchases or server accounts.
- Reward changes let players choose another part in the same reward tier **before winning**. Costs are 5, 10, 20, 25, then 25 diamonds for every further change in that puzzle.
- Closing, reloading or retrying preserves the offer and change count. Only a new puzzle after completion resets the counter. A failed run grants no part.
- A completed session cannot grant its reward twice. Replaying an unlocked level creates a new session and can earn another copy.
- Six part categories have four tiers each: CPU, GPU, RAM kit, SSD, PSU and cooling. Each PC has one slot per category. Attachments are informational in this version; PC models, revenue and satisfaction retain their existing upgrade rules.
- There are 100 levels. Reward tiers advance at levels 31, 61 and 91. Dust and heat clear on matches; cable and virus also clear beside matches. Virus spreads every third normal move. Cooling pauses it for three moves.
- Four-tile matches create line blasters; five create RGB cores. Lifelines consume their own charges, not moves. Ordinary matches fill a six-point meter that earns Free Move, CPU, Cooling, then GPU in a saved rotation. Each level's first clear also awards its catalog booster once.

The source comparison and corrected tile artwork, targeting, animations, levels and lifeline rules are documented in [BUILD_AND_BOOT_PARITY.md](BUILD_AND_BOOT_PARITY.md). This distinguishes integrated gameplay from the original standalone screens and quiz gates.

## Persistence and implementation

`WorkshopSystem` owns diamonds, part instances, assignments and puzzle sessions. It validates a draft and saves the full game snapshot before publishing a mutation. A failed save leaves the previous state intact. Board random state is persisted for exact resume.

`SaveManager` retains the existing browser-storage key and migrates version 1 to version 2. PC IDs, tiers, economy, staff, receptions, facilities, placed objects and expansion progress restore together. Version 1 did not contain reception placement or decorative/building objects; only its recorded fields can be recovered, with a starter reception supplied when absent. Corrupt and future-version saves show a recovery screen without overwriting the original.

Changes from another tab pause the older tab and require reloading. Save writes also reject a stale snapshot so it cannot overwrite newer progress.

`src/puzzle/` contains board rules and level configuration. `src/data/parts.ts` contains hardware definitions. `WorkshopUI` provides puzzle and inventory dialogs; `StationInspector` provides per-PC attachment controls.

## Verification

```powershell
corepack pnpm install --frozen-lockfile
npm test
npm run build
corepack pnpm exec playwright install chromium
npm run test:e2e
python scripts/verify_models.py
```

Browser tests use isolated saves and run desktop and mobile Chromium. Full wins are played through UI actions; tests that seed failure or equipment states explicitly identify those fixtures. Screenshots and traces are written to `test-results/`; the browsable report is in `playwright-report/`. Use `npm run test:e2e -- --headed --project desktop` to watch a desktop run.

### Completed validation

- 46 unit tests passed after the source-based Build & Boot corrections, including 2,000 generated boards, 3,000 moves/boosters and 2,000 equipment operations.
- 40 distinct browser cases passed across desktop and mobile Chromium. The 36-case regression run passed; a subsequent 12-case focused run repeated eight power-up cases and added four keyboard/legacy-save/rendering cases after the final changes. Both layouts completed levels 1–6 through real UI moves, covering every hazard type. Touch swipes, reward prices, failure/retry, inventory replacement, reloads, storage failures and stale tabs were exercised.
- The full earn → attach → PC inspector → detach → reload flow also passed in a visible desktop browser.
- The production build opened successfully in a visible Chromium window with no JavaScript or resource errors. TypeScript/build checks, model-path verification and Git whitespace checks passed.
- The existing Vite chunk-size warning remains; the resulting main JavaScript bundle is approximately 806 kB before gzip. This feature does not add backend accounts, payments or hardware performance bonuses.
