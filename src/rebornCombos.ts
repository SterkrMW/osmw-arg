import combosFile from './assets/reborn-combos.json';
import tier2File from './assets/reborn-tier2.json';

// ── Types ────────────────────────────────────────────────────────────────────
export type Gender = 'male' | 'female';

/** A stat/resistance value that may differ by gender. */
export type GenderedNumber = number | { male: number; female: number };

export type StatKey = 'strength' | 'intelligence' | 'agility' | 'stamina';

export interface RebornPath {
	id: string;
	startRace: string;
	secondRace: string;
	label: string;
	relativeStats: Record<StatKey, GenderedNumber>;
	resistances: Record<string, GenderedNumber>;
	effectAffinity: number;
	damageBonusPercent: number;
}

interface CombosFile {
	stats: StatKey[];
	paths: RebornPath[];
}

const file = combosFile as unknown as CombosFile;

/**
 * Tier-2 (second rebirth) preset, keyed by the race held before the second
 * rebirth (Y). The base fields are already folded into reborn-combos.json's
 * X→Y path totals; only `sameRace` is an *additional* bonus, granted when the
 * final race (Z) matches Y. See buildSecondReborn().
 */
export interface Tier2SameRace {
	resistances: Record<string, number>;
	effectAffinity: number;
	damageBonusPercent: number;
}

interface Tier2Race {
	id: string;
	race: string;
	label: string;
	sameRace: Tier2SameRace;
}

interface Tier2File {
	races: Tier2Race[];
}

const tier2 = tier2File as unknown as Tier2File;

// ── Stat metadata ────────────────────────────────────────────────────────────
export const STAT_KEYS: StatKey[] = ['strength', 'intelligence', 'agility', 'stamina'];

export const STAT_LABELS: Record<StatKey, string> = {
	strength: 'STR',
	intelligence: 'INT',
	agility: 'AGI',
	stamina: 'STA',
};

/** relativeStats are multipliers where 1.0 is the baseline (no bonus). */
export const STAT_BASELINE = 1;
/** Upper bound of the radar scale — the largest multiplier in the data is 1.85. */
export const STAT_MAX = 2;

// ── Path lookup, keyed to the app's numeric race indices ─────────────────────
// App race order (see comboLore.ts): 0=Human, 1=Centaur, 2=Mage, 3=Borg.
const RACE_INDEX: Record<string, number> = { human: 0, centaur: 1, mage: 2, borg: 3 };

export const pathsByKey: Record<string, RebornPath> = {};
for (const path of file.paths) {
	const key = `${RACE_INDEX[path.startRace]}_${RACE_INDEX[path.secondRace]}`;
	pathsByKey[key] = path;
}

/** Tier-2 same-race bonus, keyed by the app's numeric race index. */
export const tier2SameRaceByIndex: Record<number, Tier2SameRace> = {};
for (const race of tier2.races) {
	tier2SameRaceByIndex[RACE_INDEX[race.race]] = race.sameRace;
}

// ── Star normalisation — relative to the strongest path in each metric ───────
export const MAX_EFFECT_AFFINITY = Math.max(...file.paths.map((p) => p.effectAffinity));
export const MAX_DAMAGE_BONUS = Math.max(...file.paths.map((p) => p.damageBonusPercent));

// ── Second-rebirth build (X → Y → Z) ─────────────────────────────────────────
// A twice-reborn character is three races: X (origin) → Y (first reborn) → Z
// (second reborn / final). The X→Y path total already includes tier1(X) +
// tier2(Y) base + the X_Y secret combo; the *only* thing the second rebirth adds
// on top is tier2(Y)'s same-race bonus, granted when the final race Z equals Y.

/** Add a plain number onto a possibly-gendered value (both branches shift). */
function addToGendered(existing: GenderedNumber | undefined, add: number): GenderedNumber {
	if (existing === undefined) return add;
	if (typeof existing === 'number') return existing + add;
	return { male: existing.male + add, female: existing.female + add };
}

/**
 * Resolve the full bonuses of a second-reborn character as a RebornPath so it
 * can be rendered by the shared ComboBack view. Stats (the radar) are unchanged
 * by Z — only resistances / affinity / damage grow, and only when Z === Y.
 */
export function buildSecondReborn(x: number, y: number, z: number): RebornPath {
	const base = pathsByKey[`${x}_${y}`];
	const sameRace = tier2SameRaceByIndex[y];
	const sameRaceActive = z === y;

	const resistances: Record<string, GenderedNumber> = { ...base.resistances };
	let effectAffinity = base.effectAffinity;
	let damageBonusPercent = base.damageBonusPercent;

	if (sameRaceActive && sameRace) {
		for (const [key, value] of Object.entries(sameRace.resistances)) {
			resistances[key] = addToGendered(resistances[key], value);
		}
		effectAffinity += sameRace.effectAffinity;
		damageBonusPercent += sameRace.damageBonusPercent;
	}

	return {
		id: `${base.startRace}_${base.secondRace}_${z}`,
		startRace: base.startRace,
		secondRace: base.secondRace,
		label: base.label,
		relativeStats: base.relativeStats,
		resistances,
		effectAffinity,
		damageBonusPercent,
	};
}

// Star scale for the builder view — the ceiling is a same-race second rebirth,
// so fold each path's tier2 same-race top-up into the max.
export const MAX_EFFECT_AFFINITY_2RB = Math.max(
	...file.paths.map(
		(p) =>
			p.effectAffinity +
			(tier2SameRaceByIndex[RACE_INDEX[p.secondRace]]?.effectAffinity ?? 0),
	),
);
export const MAX_DAMAGE_BONUS_2RB = Math.max(
	...file.paths.map(
		(p) =>
			p.damageBonusPercent +
			(tier2SameRaceByIndex[RACE_INDEX[p.secondRace]]?.damageBonusPercent ?? 0),
	),
);

/** Map a value onto a 0–5 star scale (rounded to the nearest half) against its max. */
export function toStars(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.round(((value / max) * 5) * 2) / 2;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function isGendered(v: GenderedNumber): v is { male: number; female: number } {
	return typeof v !== 'number';
}

export function resolveGendered(v: GenderedNumber, gender: Gender): number {
	return typeof v === 'number' ? v : v[gender];
}

/** True if any stat or resistance on this path splits by gender. */
export function pathHasGenderSplit(path: RebornPath): boolean {
	const values = [...Object.values(path.relativeStats), ...Object.values(path.resistances)];
	return values.some(isGendered);
}

/** Turn a camelCase resistance key into a readable label ("frailtyResist" → "Frailty Resist"). */
export function resistanceLabel(key: string): string {
	return key
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (c) => c.toUpperCase())
		.trim()
		.replace(/\bDamage\b/, 'Dmg'); // keep long compound names inside the narrow tile
}
