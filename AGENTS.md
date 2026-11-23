# Repository Guidelines

## Project Structure & Module Organization

This browser game uses TypeScript, Three.js, and Vite. `src/main.ts` initializes `src/game/`. Keep simulation in `src/systems/`, objects in `src/entities/`, services in `src/services/`, UI in `src/ui/`, and catalogs/layout in `src/data/`. Puzzle rules live in `src/puzzle/`; feature styles use matching CSS files.

Runtime assets live in `public/`, originals in `source-assets/`, and processing utilities in `scripts/`. Consult `docs/` for inventories, licenses, and puzzle behavior. `dist/` is generated. Tests live in `tests/unit/` and `tests/browser/`.

## Build, Test, and Development Commands

Use Node.js 22.6+ and pnpm 11.25.0. Run commands from the repository root:

- `corepack pnpm install --frozen-lockfile`: restore dependencies using `pnpm-lock.yaml`; avoid creating an npm lockfile.
- `npm run dev -- --host 127.0.0.1 --port 3000 --strictPort`: start the local game at port 3000.
- `npm run build`: run TypeScript checks and produce the Vite build in `dist/`.
- `npm test`: run Node's TypeScript unit tests.
- `corepack pnpm exec playwright install chromium`: install the browser for testing.
- `npm run test:e2e`: run desktop/mobile Chromium playthroughs; inspect `playwright-report/` for results.
- `npm run preview -- --host 127.0.0.1`: serve the production build locally.
- `python scripts/verify_models.py`: report missing literal GLB paths referenced by TypeScript; inspect its output for warnings.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, semicolons, and explicit types for contracts. Use PascalCase for classes/interfaces and filenames, camelCase for methods/variables, and UPPER_SNAKE_CASE for constants. Retain `.ts` extensions in imports. Strict and unused-code checks are enabled; no formatter or linter is configured.

## Testing Guidelines

Run the build and relevant tests for code changes. Name unit tests `*.test.ts` and browser tests `*.spec.ts`. Cover rewards, diamond charges, inventory conservation, failed-save rollback, and reloads. Browser wins must use real moves; label seeded fixtures explicitly. Inspect affected visuals and console/network errors. No coverage threshold is enforced.

## Commit & Pull Request Guidelines

Upstream history uses concise `feat:` messages. Use focused, action-oriented commits. PRs should explain behavior changes, link relevant issues, list validation results, and include screenshots for visual changes. Record asset provenance in `docs/ASSET_LICENSES.md` and update the inventory. Exclude dependencies, generated reports, local IDE settings, and secrets.

## Save & Reward Rules

Persist workshop changes through `WorkshopSystem`. Preserve version-1 migration and PC IDs. Save rewards, completion, and diamond changes together. Never silently overwrite corrupt or unsupported saves.

Neighborhood purchases use `NeighborhoodSystem`. Share routes through `world-layout.ts`; respect reserved expansion land. Recordings belong in ignored `artifacts/gameplay/`.
