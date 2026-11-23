# Lounge Fix Verification

Date: 23 November 2026. Branch: `codex/darshan-team-setup`.

This document follows the historical [19-finding lounge audit](LOUNGE_BUG_AUDIT.md). It records the implemented repairs and their regression checks.

## Repairs

| Findings | Result | Regression evidence |
| --- | --- | --- |
| L01–L02 | Rotated PCs reserve six tiles for the desk, chair and approach. Off-floor access and conflicting chair/desk upgrades are rejected. Existing PC anchors and IDs are preserved. | Unit geometry checks; desktop/mobile invalid-placement and occupied-upgrade cases. |
| L03 | The doorway stays clear. A purchase or move must preserve reachable chairs, reception queue positions and customer exit routes. | Entrance placement UI checks; sealed-route unit fixture. |
| L04 | Only reachable, visible PCs receive assignments. Failed arrivals retry with a progress deadline, release their reservation and leave without charging for an unplayed session. | Recovery fixtures in Node and Chromium; real full customer sessions. |
| L05–L07 | Navigation rejects blocked destinations and returns an empty path on failure. Every search edge and smoothed segment checks physical clearance. | Node and Chromium path fixtures. |
| L08 | Walking customers collide with their assigned desk. Seating and standing use short local transitions at the chair; walking has no desk exemption. | Collision fixtures and real customer sessions. |
| L09–L10 | Reserved/occupied/upgrading PCs cannot move. A hidden moving object has no collider and cannot receive customers. Cancel restores its owned reservations. | Move/cancel UI, occupied-PC UI and unit checks. |
| L11–L12 | Reception reserves and validates its staff row. Reservations retain multiple owners for overlapping legacy saves. All three queue positions must be reachable. | Ownership and queue-boundary fixtures. |
| L13 | Reception moves retarget waiting customers and relocate the existing receptionist. Unrelated building changes preserve check-in progress. | Live queue relocation UI and service-timer regressions. |
| L14 | Placement, movement, rotation, restore and collision use shared wall geometry. | Chromium wall move/rotation fixture and unit geometry checks. |
| L15 | Unlocking expansions creates missing grid cells; the final floor has all 528 usable cells. | All-six-wing UI, edge placement and cell-by-cell checks. |
| L16 | Upgrade buttons and entities reject concurrent requests. Models prepare before a synchronous cash/tier commit. Failed models keep the old furniture and cash. | Deferred-load double clicks on all seven PC components, reception and a facility; failed-load fixtures. |
| L17–L18 | Each technician adds 25% station satisfaction. Additional cashiers and counter tiers reduce the actual two-second check-in service time. | Hiring UI, score checks and comparative service timing in Chromium. |
| L19 | Session billing, wages, facility income and the clock share a 15-second game hour. A session pays once. | Clock/payment unit check and measured live session payments. |

## Existing saves and failure handling

Old layouts remain intact. Blocked PCs display an access warning and are skipped until nearby furniture is moved. The legacy-save browser case moves an obstructing planter, clears the warning and checks that the PC still owns its chair tiles.

New purchases commit after model preparation. Preview loading failures are caught and reported. Preview meshes own their geometry so cancelling a hologram cannot dispose geometry used by real furniture.

## Reproduction

```powershell
npm test
npm run build
npx playwright test
python scripts/verify_models.py
```

Focused lounge checks: `npx playwright test tests/browser/lounge.spec.ts`.

With the production preview running on port 4174: `node --experimental-strip-types scripts/verify-lounge-production.ts`.

`tests/browser/lounge.spec.ts` identifies controlled fixtures separately from normal UI actions. The local development-entry hook exposes the existing Game instance for measurement; it does not add a production debug API. Tests use isolated browser storage, leaving the user's open game separate.

## Verification results

- Unit tests: **64 passed**, including 18 lounge regressions.
- Asset paths: **all 98 referenced GLB paths exist**.
- Complete Chromium suite: **54 passed in 11.5 minutes**, 27 desktop and 27 mobile-emulation cases, with no skipped tests.
- Production build: **passed** (TypeScript and Vite).
- Production-build browser smoke check: **passed** in visible Chromium at 1440×1000 and mobile emulation at 393×851. Both profiles rejected a chair-blocking placement, played a legal puzzle move, hired a technician, saved and restored the same PCs and staff. No console errors, uncaught exceptions or HTTP errors were recorded.

The controlled check-in fixture measured **2.00 seconds** at the starter desk, **1.49 seconds** with an additional cashier and **1.19 seconds** with that cashier plus the tier-2 counter. This measures the service timer using the actual game classes; real customer walk/sit/pay/exit sessions are separate browser cases.

## Inspectable results

- [Complete 54-case browser report](../playwright-report/index.html) (or run `npx playwright show-report`).
- [Compiled-game results and error lists](../test-results/production-lounge/2026-11-23T11-46-15-774Z/results.json).
- [Desktop blocked-chair rejection](../test-results/production-lounge/2026-11-23T11-46-15-774Z/desktop-chair-placement-rejected.png).
- [Mobile blocked-chair rejection](../test-results/production-lounge/2026-11-23T11-46-15-774Z/mobile-chair-placement-rejected.png).
- [Seated customer with movement protected](../test-results/lounge-real-customers-walk-7d2fa-Cs-occupied-move-is-blocked-desktop/seated-and-protected.png).
- [Repaired legacy layout](../test-results/lounge-legacy-blocked-chai-8181f-rable-by-moving-its-planter-desktop/legacy-layout-repaired.png).

Future Playwright runs write to `test-results/playwright/`, preserving unrelated audit and production-smoke captures. Generated reports and screenshots remain ignored by Git.

The browser suite also covers puzzle moves, special tiles, all four lifelines, six campaign levels, reward pricing, inventory assignment, save/reload/failure handling, outside-world navigation, all expansions, café/frontage upgrades, bus visitors and tournaments.

These are local Chromium desktop and mobile-emulation checks. They do not establish behavior on physical mobile devices, other browser engines or a deployed server. Vite's existing large-bundle warning is separate from gameplay validation.
