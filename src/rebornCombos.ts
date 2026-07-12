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
 * rebirth (Y). Its base fields (resistances/relativeStats) are already folded
 * into reborn-combos.json's X→Y path totals — but they're kept here, gender-
 * split, so buildSecondReborn() can re-resolve the tier-2 portion at the first-
 * reborn gender independently of the origin gender. `sameRace` is the only
 * *additional* bonus, granted when the final race (Z) matches Y.
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
	resistances: Record<string, GenderedNumber>;
	relativeStats: Record<StatKey, GenderedNumber>;
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

/** Tier-2 presets, keyed by the app's numeric race index. */
export const tier2ByIndex: Record<number, Tier2Race> = {};
for (const race of tier2.races) {
	tier2ByIndex[RACE_INDEX[race.race]] = race;
}

// ── Star normalisation — relative to the strongest path in each metric ───────
export const MAX_EFFECT_AFFINITY = Math.max(...file.paths.map((p) => p.effectAffinity));
export const MAX_DAMAGE_BONUS = Math.max(...file.paths.map((p) => p.damageBonusPercent));

// ── Second-rebirth build (X → Y → Z) ─────────────────────────────────────────
// A twice-reborn character is three races, each with its own gender:
//   X/gx (origin) → Y/gy (first reborn) → Z (second reborn / final).
// In the game only the *previous* race's gender feeds each rebirth: the origin
// gender drives tier-1, the first-reborn gender drives tier-2. The final gender
// is appearance only and changes no bonus.
//
// reborn-combos.json[X→Y] already sums tier1(X) + tier2(Y) base + secret(X_Y),
// but resolved at a single gender. To let tier-1 and tier-2 take different
// genders we resolve the path at gx, then swap the tier-2 base contribution
// from gx to gy (the "1" and the gender-independent race bonuses cancel):
//   value = combos(gx) − tier2Base(gx) + tier2Base(gy)  [+ sameRace if Z === Y]
// Same-race and effect-affinity/damage are gender-independent.

/**
 * Resolve the full bonuses of a second-reborn character into a RebornPath of
 * already-resolved plain numbers, so the shared ComboBack view can render it
 * with no gender toggle of its own (gender is chosen per stage instead).
 */
export function buildSecondReborn(
	x: number,
	gx: Gender,
	y: number,
	gy: Gender,
	z: number,
): RebornPath {
	const base = pathsByKey[`${x}_${y}`];
	const t2 = tier2ByIndex[y];
	const sameRaceActive = z === y;

	// Resistances: swap the tier-2 base gender, then add the same-race top-up.
	const resistances: Record<string, number> = {};
	const keys = new Set<string>([
		...Object.keys(base.resistances),
		...Object.keys(t2.resistances),
		...(sameRaceActive ? Object.keys(t2.sameRace.resistances) : []),
	]);
	for (const key of keys) {
		const value =
			resolveGendered(base.resistances[key] ?? 0, gx) -
			resolveGendered(t2.resistances[key] ?? 0, gx) +
			resolveGendered(t2.resistances[key] ?? 0, gy) +
			(sameRaceActive ? t2.sameRace.resistances[key] ?? 0 : 0);
		if (value !== 0) resistances[key] = value;
	}

	// Relative stats: same gender swap on the tier-2 base (radar is Z-independent).
	// Round to 3 dp (as the game does) to shed floating-point subtraction noise.
	const relativeStats = {} as Record<StatKey, number>;
	for (const stat of STAT_KEYS) {
		const value =
			resolveGendered(base.relativeStats[stat], gx) -
			resolveGendered(t2.relativeStats[stat], gx) +
			resolveGendered(t2.relativeStats[stat], gy);
		relativeStats[stat] = Math.round(value * 1000) / 1000;
	}

	// Effect affinity / damage bonus are gender-independent.
	const effectAffinity = base.effectAffinity + (sameRaceActive ? t2.sameRace.effectAffinity : 0);
	const damageBonusPercent =
		base.damageBonusPercent + (sameRaceActive ? t2.sameRace.damageBonusPercent : 0);

	return {
		id: `${base.startRace}_${base.secondRace}_${z}`,
		startRace: base.startRace,
		secondRace: base.secondRace,
		label: base.label,
		relativeStats,
		resistances,
		effectAffinity,
		damageBonusPercent,
	};
}

// Star scale for the builder view — the ceiling is a same-race second rebirth,
// so fold each path's tier2 same-race top-up into the max.
export const MAX_EFFECT_AFFINITY_2RB = Math.max(
	...file.paths.map(
		(p) => p.effectAffinity + (tier2ByIndex[RACE_INDEX[p.secondRace]]?.sameRace.effectAffinity ?? 0),
	),
);
export const MAX_DAMAGE_BONUS_2RB = Math.max(
	...file.paths.map(
		(p) =>
			p.damageBonusPercent +
			(tier2ByIndex[RACE_INDEX[p.secondRace]]?.sameRace.damageBonusPercent ?? 0),
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
