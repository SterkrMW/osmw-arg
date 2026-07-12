import combosFile from './assets/reborn-combos.json';

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

// ── Star normalisation — relative to the strongest path in each metric ───────
export const MAX_EFFECT_AFFINITY = Math.max(...file.paths.map((p) => p.effectAffinity));
export const MAX_DAMAGE_BONUS = Math.max(...file.paths.map((p) => p.damageBonusPercent));

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
