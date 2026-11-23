# Lounge Bug Audit

Date: 23 November 2026. Branch: `codex/darshan-team-setup`.

**Historical pre-fix report.** See [Lounge Fix Verification](LOUNGE_FIX_VERIFICATION.md) for the repairs and current regression commands. The original observations and evidence below are retained for comparison.

## Result and evidence boundaries

**19 findings:** six reproduced through normal UI input, twelve reproduced with controlled in-browser fixtures using the current game classes, and one confirmed by source review. Several findings share a root cause; they do not require nineteen unrelated rewrites.

The reported stuck-chair problem is reproduced. A planter accepted beside the left starter PC blocks its seating point. During a 60-second observation, its customer stays in `WALKING_TO_STATION` from the 10-second sample through the 60-second sample, oscillating beside the desk rather than sitting. The station remains assigned, and the reception queue fills. No uncaught JavaScript exception is needed for this failure.

**Application code was unchanged during this audit.** The additions are this report and `scripts/audit-lounge.ts`. Tests use a fresh, isolated Chromium profile at `http://127.0.0.1:4173/`, desktop viewport 1440×1000. The user's open game and saved progress are separate.

Evidence labels:

- **UI:** normal placement, movement or upgrade controls; a development-response hook exposes the existing Game instance for read-only measurements.
- **Runtime:** controlled fixtures calling the actual placement, collision, customer, grid, economy and staff classes in Chromium. These are not claimed as complete player-driven playthroughs.
- **Source:** confirmed missing integration in the current code, without a measured throughput playthrough.

P1 means high-priority gameplay breakage or lost virtual funds. P2 means a functional/balance inconsistency.

## Placement and customer movement

### L01 — P1 — Chair space is missing from the station footprint [UI]

Buy a planter and place it at grid `(-3, 1)`, beside the left starter PC at `(-4, 0)`. The preview is valid and the purchase succeeds, but collision testing says the PC's seat is blocked by that planter.

The station reserves only **2×1 tiles**. Its seat is at `(-3, 0.18, 1.0745)`, outside the reserved row; the chair also extends beyond that row. No approach or pull-out space is reserved. Other furniture and neighboring PCs can occupy necessary chair space. Chair/desk upgrades also change layout without revalidating surrounding clearance.

Source: `src/data/assets.ts:17`, `src/entities/GamingStation.ts:220`, `src/systems/PlacementSystem.ts:201`.

### L02 — P1 — Valid placements can put the chair outside the room [UI]

Move a PC to grid `(-1, -2)` and rotate it 180°. The preview remains valid, but its seat becomes `(0, 0.18, -2.0745)` while the room floor begins at `z=-2`. Placement validates the catalog rectangle rather than the rotated chair and usable seating/approach positions.

Source: `src/systems/PlacementSystem.ts:201`, `src/entities/GamingStation.ts:374`, `src/systems/CollisionSystem.ts:285`.

### L03 — P1 — The entrance and circulation routes can be blocked [UI]

Place planters at `(-1, 7)` and `(0, 7)`. Both previews are valid. Their physical boxes cover the doorway approach; all nine sampled crossing positions from `x=-0.8` to `0.8` at `z=7.5` are blocked. Placement performs no entrance reservation or whole-layout connectivity check. Similar layouts can seal off an otherwise valid PC or reception counter.

Source: `src/systems/PlacementSystem.ts:201`, `src/systems/GridSystem.ts:118`, `src/data/world-layout.ts`.

### L04 — P1 — Unreachable seats stay reserved; oscillation defeats stuck recovery [UI]

Continue L01 without intervention. The first customer remains assigned to the blocked PC for the rest of the one-minute observation. Near the chair, its position repeatedly changes slightly while `stuckTimer` stays at zero. The recovery logic measures frame-to-frame movement rather than progress toward the destination. There is no overall arrival deadline, cancellation or reassignment for this case.

PC assignment checks only `!isOccupied` and reserves the station before verifying a usable route. This combines bad placement with a queue/capacity failure.

Source: `src/systems/PlacementSystem.ts:1129`, `src/systems/CustomerSystem.ts:178`, `src/entities/Customer.ts:367`.

### L05 — P1 — Failed pathfinding returns a path through the obstruction [Runtime]

Seal an entire grid row with a physical wall, then request a route across it. A* cannot reach the target, but `findPath()` returns the direct destination `(0,0,5)` even though the collision system confirms that segment is blocked. Callers receive a nonempty path instead of a failure result and continue attempting the impossible journey.

Source: `src/systems/GridSystem.ts:340`, `src/entities/Customer.ts:166`.

### L06 — P1 — The final waypoint is forced back inside blocked furniture [Runtime]

Request a route to a planter's center `(0.5,0,4.5)`. The method first searches for a nearby walkable target cell, but ultimately overwrites the last waypoint with the original blocked destination. The returned route therefore still ends inside the obstacle.

Source: `src/systems/GridSystem.ts:217`, `src/systems/GridSystem.ts:373`.

### L07 — P1 — A* routes ignore physical clearance on individual steps [Runtime]

With a correctly registered PC at `(0,0)`, route along the adjacent row from `(-1.5,0,1.5)` to `(3.5,0,1.5)`. The returned route contains three segments rejected by the supplied physical collision check. A* considers grid occupancy but does not call the collision callback when expanding neighboring nodes; the callback is used only for the direct shortcut and longer smoothing segments.

Source: `src/systems/GridSystem.ts:306`, `src/systems/GridSystem.ts:358`, `src/systems/CollisionSystem.ts:248`.

### L08 — P1 — Assigned customers ignore their entire desk, not just seating clearance [Runtime]

For a 180° PC, a segment from its front to its chair is blocked normally and becomes unblocked when its station ID is supplied. The collision system excludes **both desk and chair** for that customer throughout the route. This allows walking through the assigned desktop; departing customers also retain their old station's collision exemption.

Source: `src/systems/CollisionSystem.ts:76`, `src/entities/Customer.ts:170`, `src/entities/Customer.ts:507`.

## Moving furniture and reception

### L09 — P1 — Moving an occupied PC does not coordinate with its customer [UI]

Select a PC while its customer is gaming and click Move. The station becomes invisible while the customer remains in `GAMING`. Place it elsewhere: the seated customer slides toward the new seat through the room without a walking route or collision resolution. This also succeeds for the off-floor chair placement in L02.

For customers already walking toward a PC, the move code provides no station-moved notification to rebuild their cached destination; their arrival code then copies the station's new seat position. That additional route inconsistency is source-confirmed.

Source: `src/systems/PlacementSystem.ts:817`, `src/systems/PlacementSystem.ts:412`, `src/entities/Customer.ts:409`, `src/entities/Customer.ts:436`.

### L10 — P1 — A station being moved remains assignable and physically blocks its old position [Runtime]

Begin moving an unoccupied PC. Its model is hidden and its grid footprint is freed, but `getAvailableStation()` still returns it and collision collection still includes its old desk/chair. Customers can therefore be assigned to an invisible station, and navigation encounters an invisible obstacle where the grid now says the floor is clear.

Source: `src/systems/PlacementSystem.ts:817`, `src/systems/PlacementSystem.ts:1129`, `src/systems/CollisionSystem.ts:29`.

### L11 — P1 — Reception staff zones overwrite other objects' reservations [Runtime]

Place a planter at `(-2,-1)`, then a reception counter at `(-2,0)`. The counter preview is valid because its extra staff zone is not validated. Placing it changes the planter cell's owner to the reception staff-zone ID. Start moving that counter: the cell becomes unoccupied/walkable even though the planter still exists. Future placement can overlap the original object.

Source: `src/systems/PlacementSystem.ts:201`, `src/systems/PlacementSystem.ts:506`, `src/systems/PlacementSystem.ts:894`, `src/systems/GridSystem.ts:132`.

### L12 — P1 — Reception queues can be positioned outside the building [Runtime]

Place a 180° counter at `(-6,-2)`. Placement succeeds, but its first three queue points have `z=-2.35`, `-3.2`, and `-4.05`, outside the room. Neither placement nor shortest-queue reception selection checks whether those interaction points are reachable.

Source: `src/entities/ReceptionDesk.ts:136`, `src/systems/PlacementSystem.ts:201`, `src/systems/CustomerSystem.ts:278`.

### L13 — P1 — Moving reception leaves waiting customers at old positions [Runtime]

With a customer waiting at `(0,0,5.35)`, move the counter two tiles forward. The new queue point is `(0,0,7.35)`, but both the customer and cached target remain at the old position. Collision testing places that waiting customer inside the moved counter. The move callback updates the receptionist model but does not reroute the queue.

Source: `src/game/Game.ts:220`, `src/entities/Customer.ts:404`, `src/systems/CustomerSystem.ts:201`.

### L14 — P1 — Rotated walls keep the old collision orientation [Runtime]

Place a solid wall, move it and rotate it 90°. Its rotation becomes `1`, but its stored collision half-extents remain `halfW=0.15`, `halfD=0.96` instead of being swapped/recomputed. The visible wall and physical barrier disagree. Restore uses a separate calculation, so the live-move and restore paths are inconsistent as well.

Source: `src/systems/PlacementSystem.ts:449`, `src/systems/PlacementSystem.ts:571`, `src/systems/PlacementSystem.ts:752`, `src/systems/CollisionSystem.ts:155`.

## Expansion, upgrades and business rules

### L15 — P1 — The final expansion exposes 88 floor cells without a grid [Runtime]

The game constructs a fixed 24×24 grid spanning `[-12,12)` on each axis. The final floor spans `x=[-10,14)`, `z=[-14,8)`. Unlocking an expansion updates existing cells but never creates the missing east/north cells. **88 of the final 528 visible floor cells have no grid cell**, so placement/pathfinding cannot use them. The east strip first becomes a problem at expansion stage 4.

Source: `src/game/Game.ts:63`, `src/systems/GridSystem.ts:33`, `src/systems/GridSystem.ts:154`, `src/data/world-layout.ts`, `src/systems/ExpansionSystem.ts:613`.

### L16 — P1 — Rapid PC upgrade clicks charge twice for one tier [UI]

Under a controlled one-second tier-2 model-loading delay, double-click the PC upgrade button. Cash changes from `$1,797,360` to `$1,795,660`: **two $850 charges**, while the PC advances only from tier 1 to tier 2. PC upgrade handlers have no in-flight guard, and spending triggers an inspector rerender before the asynchronous upgrade finishes. Similar handlers for other station parts/reception require the same review; those variants were not separately reproduced.

Source: `src/ui/StationInspector.ts:54`, `src/ui/StationInspector.ts:523`, `src/entities/GamingStation.ts:290`.

### L17 — P2 — Hiring the technician does not apply its advertised satisfaction benefit [Runtime + source]

Hire a technician: the count and cost change, but the probe station's satisfaction stays **70 → 70**, despite the advertised +25%. `hire()` only increments this role's count; the current game update/score calculation contains no technician modifier. Wages are still charged.

Source: `src/systems/StaffSystem.ts:34`, `src/systems/StaffSystem.ts:63`, `src/entities/GamingStation.ts:362`, `src/game/Game.ts:510`.

### L18 — P2 — Cashier/reception speed perks are not connected to check-in [Source]

The interface advertises +35% throughput for reception staff and +25%/+50% for upgraded counters. Actual check-in assigns a waiting customer immediately whenever a free station exists. That logic has no service timer, staff-count multiplier or reception-tier modifier. These advertised bonuses have no implementation in the current check-in path. No comparative timed customer playthrough was performed for this finding.

Source: `src/systems/StaffSystem.ts:26`, `src/entities/ReceptionDesk.ts:24`, `src/systems/CustomerSystem.ts:174`.

### L19 — P2 — Gaming payments use a different hour length from the game clock [Runtime]

The clock advances four game minutes per real second, so one game hour is 15 real seconds; wages/facility revenue use that conversion. PC session billing instead divides session seconds by **10**. A 20-second session at `$28/hour` pays **$56**, while the displayed clock conversion gives approximately **$37**. The rate units are inconsistent and gaming revenue is about 50% higher than that clock implies.

Source: `src/entities/Customer.ts:463`, `src/systems/EconomySystem.ts:42`, `src/systems/StaffSystem.ts:88`, `src/game/Game.ts:514`.

## Recommended repair order

1. **Placement/access:** reserve the complete rotated station and seating approach; protect entry/exit and required interaction points; validate connectivity before accepting purchases or moves.
2. **Navigation/recovery:** return explicit no-route results, validate every physical segment and destination, and release/reassign reservations when arrival makes no progress.
3. **Editing live objects:** coordinate NPCs/queues during moves; exclude moving objects from assignment; update occupancy ownership and collision geometry together.
4. **Expansion grid:** size or grow the grid to all declared room bounds.
5. **Purchases/perks:** guard upgrades against reentry, then connect promised staff/counter benefits and standardize time units.

Add regression cases for invalid layouts and live-object editing before repairing these paths. Existing happy-path puzzle/progression/save checks do not establish arbitrary-layout safety.

## Inspectable evidence

The original successful audit used transient captures under `test-results/lounge-audit/2026-11-23T10-52-58-557Z/`. The test runner subsequently replaced that generated output. The measurements above retain the historical findings; current screenshots, timings and reproduction steps are linked from [Lounge Fix Verification](LOUNGE_FIX_VERIFICATION.md).

The original audit recorded no uncaught JavaScript exceptions. The discovered failures were gameplay/state errors that did not need a console exception to occur.

Original pre-fix diagnostic commands (the repaired game now rejects these unsafe actions; this script is not a post-fix acceptance test):

```powershell
node --experimental-strip-types scripts/audit-lounge.ts
# Skip the one-minute live-customer observation and occupied-PC UI case:
node --experimental-strip-types scripts/audit-lounge.ts --quick
```

The script intercepts only the local development entry response to expose the existing Game object for inspection. It does not modify repository game source. Runtime fixtures are created in separate scene/system instances. Generated evidence stays under ignored `test-results/`.
