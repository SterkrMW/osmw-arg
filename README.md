# The Paths of Rebirth

A public MythWar discovery wall and second-rebirth planner. The Wall preserves the first discoverer of each of the 16 origin/first-rebirth combinations. **Trace a Path** calculates a complete three-life path, compares two alternatives, explains their inherited bonuses and resulting growth rates, and finds routes matching a player's growth goals.

## Layout

- `src/App.tsx` owns the active view, remembered planner draft, shared-link navigation, and discovery polling. `ComboGrid`, `ComboCard`, and `ComboModal` render the Wall.
- `RebornBuilder`, `PathFinderPanel`, and `PlannerResults` render the planner. `planner.ts` calculates growth, bonus sources, shared chart scales, and comparison rows. `pathFinder.ts` filters and ranks the path catalogue. `plannerState.ts` validates and stores selections and finder settings, migrates drafts, and encodes shared links.
- `src/assets` contains committed server-rule exports. `reborn-combos.json` and `reborn-tier2.json` retain the Wall's relative bonus index; `reborn-planner.json` supplies the actual-growth planner.
- `api` contains the Redis-backed discovery endpoints. `scripts/dev-api.ts` provides the local API. Planner calculations and sharing require no account, API calls, or database writes.
- `scripts/export-planner.mjs` reads the parent server's authoritative rules. `tests` contains standalone regression tests and the independent server-parity test.

## Development and validation

```sh
npm install
npm start
npm test
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.api.json
npm run build
```

The Vite frontend listens on port 3000 and proxies the development API on port 3001. The repository tracks `dist/`; review its generated changes after building. The existing `test:unlock` command **posts discovery events** to its configured endpoint and is not part of the regression suite.

When the parent server checkout and its dependencies are available:

```sh
npm run data:check
npm run test:exporter
npm run test:server-parity
```

The parity test uses the parent's Vitest runner and alias configuration, real history recalculation, and real stat objects, including their growth setters. Normal frontend builds and standalone tests use the committed fixture and do not require the server checkout.

## Updating the rules

```sh
npm run data:export
npm run data:check
npm test
npm run test:exporter
npm run test:server-parity
```

The exporter defaults to the server three directories above this project. An alternative checkout can be supplied with `npm run data:export -- --server-root <path>` (also supported by `data:check`). It reads server sources and writes only the planner fixture in this app. It rejects unsupported preset fields or calculation changes rather than silently dropping a bonus. The fixture includes source fingerprints; even unrelated edits to those source files require a reviewed refresh.

The planner sums the contributions from both historical race/gender presets, both applicable same-race bonuses, and the origin/first-rebirth combo. It then applies the final race's base growth, the global rebirth multiplier, accumulated race percentages, and additive growth in the server's order. Each growth assignment is rounded at the exported precision. The final gender is retained in drafts and links but does not affect these inherited bonuses or growth rates.

Growth is a coefficient, not a projected HP/MP/attack/speed total. The model covers ordinary complete two-rebirth histories; it does not model legacy migrated histories, level, allocated points, equipment, or other character bonuses. Affinity is points, not success chance. The damage bonus applies to damage-skill power and excludes healing and Drain. The Wall's two-race index cannot determine actual growth without a final race.

## Drafts and links

Drafts use the versioned `osmw.reborn-planner.v2` local-storage key. They contain A, optional retained B, comparison visibility, the chart-values preference, and finder settings (section visibility, life pins, final-race filter, goal, and minimum requirements). Existing version-1 drafts migrate automatically with fresh finder settings; the old storage entry is left intact. Closing comparison retains B. Storage failures leave the current in-memory session usable.

Shared links continue to use `?planner=1&a=0m-1f-2m` and optional `&b=3f-0m-0f`. Each token records a race (`0` Human, `1` Centaur, `2` Mage, `3` Borg) and gender (`m`/`f`) for birth, first rebirth, and final life. Links share selections, not a historical balance snapshot, finder settings, or the sender's display preferences. Valid links take precedence over remembered paths and reset finder settings so local pins cannot constrain the linked path; malformed links are rejected as a whole. A plain root URL opens the Wall.

## Finding paths

Open **Find paths** to reveal the life-pin controls and help text. They are hidden by default to keep the A/B comparison aligned, and remain available while any life is pinned so it can always be unpinned. Pin any life in A to keep both its race and gender fixed while planning. Pins constrain A and recommendations; B stays editable and shows a notice if it differs from a pinned life. Pinning the final life resets and locks the final-race filter to Same as Path A.

The finder enumerates 256 effective selections locally using the same calculator and committed data as the planner. Every candidate inherits A's final gender because it does not affect results. Choose one goal and optional minimum requirements in their displayed units. Blank minimums do not filter; zero and negative minimums are valid. Invalid numeric text is retained for correction and pauses results, including candidate loading. Requirements are inclusive, and missing resistance/combat bonuses count as zero.

Matches sort by the selected goal, highest first, with stable race/gender ordering inside ties. Equivalent routes stay separate; there is no combined build score. Results appear ten at a time. Only **Use as Path B** replaces B and opens comparison. No-match searches retain every constraint. Rebirth timing and level-based character projections remain outside this release.

`npm run test:browser` runs browser acceptance against a frontend on `http://127.0.0.1:3107` (override with `BASE_URL`). It requires an installed Playwright Chromium browser and the `playwright-core` package, either resolvable normally or supplied through the `PLAYWRIGHT_MODULE` environment variable as a module path. This optional browser tooling is not required for builds or the standalone tests. The checks mock discovery responses and cover independent editing, hide/reopen, sharing and clipboard fallback, draft migration and persistence, malformed links, disabled storage, chart toggling, life pins, finder requirements and pagination, candidate loading, keyboard focus, reduced motion, and narrow layouts; no event records are changed.
