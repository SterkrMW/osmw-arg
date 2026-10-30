# The Paths of Rebirth

A public MythWar discovery wall and second-rebirth planner. The Wall preserves the first discoverer of each of the 16 origin/first-rebirth combinations. **Trace a Path** calculates a complete three-life path, compares two alternatives, and explains their inherited bonuses and resulting growth rates.

## Layout

- `src/App.tsx` owns the active view, remembered planner draft, shared-link navigation, and discovery polling. `ComboGrid`, `ComboCard`, and `ComboModal` render the Wall.
- `RebornBuilder` and `PlannerResults` render the planner. `planner.ts` calculates growth, bonus sources, shared chart scales, and comparison rows. `plannerState.ts` validates and stores selections and encodes shared links.
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

Drafts use the versioned `osmw.reborn-planner.v1` local-storage key. They contain A, optional retained B, comparison visibility, and the chart-values preference. Closing comparison retains B. Storage failures leave the current in-memory session usable.

Shared links use `?planner=1&a=0m-1f-2m` and optional `&b=3f-0m-0f`. Each token records a race (`0` Human, `1` Centaur, `2` Mage, `3` Borg) and gender (`m`/`f`) for birth, first rebirth, and final life. Links share selections, not a historical balance snapshot or the sender's display preferences. Valid links take precedence over remembered paths; malformed links are rejected as a whole. A plain root URL opens the Wall.

`npm run test:browser` runs browser acceptance against a frontend on `http://127.0.0.1:3107` (override with `BASE_URL`). It requires an installed Playwright Chromium browser and the `playwright-core` package, either resolvable normally or supplied through the `PLAYWRIGHT_MODULE` environment variable as a module path. This optional browser tooling is not required for builds or the standalone tests. The checks mock discovery responses and cover independent editing, hide/reopen, sharing and clipboard fallback, persistence, malformed links, disabled storage, chart toggling, keyboard focus, reduced motion, and narrow layouts; no event records are changed.
