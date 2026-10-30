import plannerFile from './assets/reborn-planner.json';
import type { Gender, StatKey } from './rebornCombos';

export type Race = 0 | 1 | 2 | 3;
export interface LifeSelection {
	race: Race;
	gender: Gender;
}
export interface PathSelection {
	origin: LifeSelection;
	first: LifeSelection;
	final: LifeSelection;
}
export type GrowthValues = Record<StatKey, number>;

export interface BonusSource {
	id: string;
	label: string;
	active: boolean;
	resistances: Record<string, number>;
	additiveGrowth: GrowthValues;
	raceBonusPercent: GrowthValues;
	effectAffinity: number;
	damageBonusPercent: number;
}

export interface PathResult {
	baseGrowth: GrowthValues;
	/** Growth after the flat bonus for two rebirths. */
	rebirthGrowth: GrowthValues;
	/** Growth after the accumulated race percentage has been applied. */
	raceGrowth: GrowthValues;
	/** Summed flat growth contribution, not a percentage. */
	additiveGrowth: GrowthValues;
	raceBonusPercent: GrowthValues;
	growthRates: GrowthValues;
	resistances: Record<string, number>;
	effectAffinity: number;
	damageBonusPercent: number;
	sources: BonusSource[];
}

export interface ComparisonRow {
	key: string;
	label: string;
	group: 'Growth rates' | 'Skill bonuses' | 'Resistance and combat bonuses';
	a: number;
	b: number;
	delta: number;
	unit: 'growth' | 'points' | 'percent';
}

interface SameRaceBonus {
	resistanceBonuses: Record<string, number>;
	effectAffinity: number;
	damageBonusPercent: number;
}
interface Preset {
	resistanceBonuses: Record<string, number>;
	statGrowthBonuses: Partial<GrowthValues>;
	raceStatBonus: { stat: StatKey; bonus: number };
	sameRace: SameRaceBonus;
}
interface ComboBonus extends SameRaceBonus {
	statGrowthBonuses: Partial<GrowthValues>;
}
interface PlannerData {
	flatGrowthBonusPerRebirth: number;
	growthRateDecimals: number;
	baseGrowthByRace: Record<Race, GrowthValues>;
	tier1: Record<string, Preset>;
	tier2: Record<string, Preset>;
	secretCombos: Record<string, ComboBonus>;
}

const data = plannerFile as unknown as PlannerData;
export const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'] as const;
export const GROWTH_LABELS: Record<StatKey, string> = {
	strength: 'Attack (STR)',
	intelligence: 'MP (INT)',
	agility: 'Speed (AGI)',
	stamina: 'HP (STA)',
};
export const GROWTH_DECIMALS = data.growthRateDecimals;
export const REBIRTH_GROWTH_PERCENT = data.flatGrowthBonusPerRebirth * 2 * 100;
const keys: StatKey[] = ['strength', 'intelligence', 'agility', 'stamina'];
const genders: Gender[] = ['male', 'female'];
const races: Race[] = [0, 1, 2, 3];
const factor = 10 ** GROWTH_DECIMALS;
const roundGrowth = (value: number): number => Math.round(value * factor) / factor;
const emptyGrowth = (): GrowthValues => ({ strength: 0, intelligence: 0, agility: 0, stamina: 0 });

function validLife(life: LifeSelection): boolean {
	return life != null && races.includes(life.race) && genders.includes(life.gender);
}

function makeSource(id: string, label: string, active = true): BonusSource {
	return {
		id,
		label,
		active,
		resistances: {},
		additiveGrowth: emptyGrowth(),
		raceBonusPercent: emptyGrowth(),
		effectAffinity: 0,
		damageBonusPercent: 0,
	};
}

function baseSource(id: string, label: string, preset: Preset): BonusSource {
	const source = makeSource(id, label);
	source.resistances = { ...preset.resistanceBonuses };
	Object.assign(source.additiveGrowth, preset.statGrowthBonuses);
	source.raceBonusPercent[preset.raceStatBonus.stat] = preset.raceStatBonus.bonus;
	return source;
}

function sameRaceSource(
	id: string,
	label: string,
	bonus: SameRaceBonus,
	active: boolean,
): BonusSource {
	const source = makeSource(id, label, active);
	if (active) {
		source.resistances = { ...bonus.resistanceBonuses };
		source.effectAffinity = bonus.effectAffinity;
		source.damageBonusPercent = bonus.damageBonusPercent;
	}
	return source;
}

/** Standard complete two-rebirth history; final gender does not change inherited bonuses or growth. */
export function calculatePath(selection: PathSelection): PathResult {
	if (
		!selection ||
		!validLife(selection.origin) ||
		!validLife(selection.first) ||
		!validLife(selection.final)
	) {
		throw new RangeError('Choose a valid race and gender for each life.');
	}
	const { origin, first, final } = selection;
	const t1 = data.tier1[`${origin.gender}${RACE_NAMES[origin.race]}`];
	const t2 = data.tier2[`${first.gender}${RACE_NAMES[first.race]}`];
	const combo =
		data.secretCombos[
			`${RACE_NAMES[origin.race].toLowerCase()}_${RACE_NAMES[first.race].toLowerCase()}`
		];
	const comboSource = makeSource(
		'secret-combo',
		`${RACE_NAMES[origin.race]} → ${RACE_NAMES[first.race]} combo`,
		Boolean(combo),
	);
	if (combo) {
		comboSource.resistances = { ...combo.resistanceBonuses };
		Object.assign(comboSource.additiveGrowth, combo.statGrowthBonuses);
		comboSource.effectAffinity = combo.effectAffinity;
		comboSource.damageBonusPercent = combo.damageBonusPercent;
	}
	const sources = [
		baseSource('first-base', `First rebirth: ${RACE_NAMES[origin.race]} ${origin.gender}`, t1),
		sameRaceSource(
			'first-same-race',
			'First rebirth: same-race bonus',
			t1.sameRace,
			origin.race === first.race,
		),
		baseSource('second-base', `Second rebirth: ${RACE_NAMES[first.race]} ${first.gender}`, t2),
		sameRaceSource(
			'second-same-race',
			'Second rebirth: same-race bonus',
			t2.sameRace,
			first.race === final.race,
		),
		comboSource,
	];
	const additiveGrowth = emptyGrowth();
	const raceBonusPercent = emptyGrowth();
	const resistances: Record<string, number> = {};
	let effectAffinity = 0;
	let damageBonusPercent = 0;
	for (const source of sources) {
		for (const key of keys) {
			additiveGrowth[key] += source.additiveGrowth[key];
			raceBonusPercent[key] += source.raceBonusPercent[key];
		}
		for (const [key, value] of Object.entries(source.resistances))
			resistances[key] = (resistances[key] ?? 0) + value;
		effectAffinity += source.effectAffinity;
		damageBonusPercent += source.damageBonusPercent;
	}
	for (const key of Object.keys(resistances)) if (resistances[key] === 0) delete resistances[key];
	const baseGrowth = { ...data.baseGrowthByRace[final.race] };
	const rebirthGrowth = emptyGrowth();
	const raceGrowth = emptyGrowth();
	const growthRates = emptyGrowth();
	for (const key of keys) {
		baseGrowth[key] = roundGrowth(baseGrowth[key]);
		// Each assignment matches the real StatGroup setter's rounding. Combining
		// these expressions and rounding only at the end changes some results.
		rebirthGrowth[key] = roundGrowth(baseGrowth[key] * (1 + 2 * data.flatGrowthBonusPerRebirth));
		raceGrowth[key] = roundGrowth(rebirthGrowth[key] * (1 + raceBonusPercent[key] / 100));
		growthRates[key] = roundGrowth(raceGrowth[key] + additiveGrowth[key]);
		// Only clean the displayed aggregate after it has fed the real calculation.
		additiveGrowth[key] = roundGrowth(additiveGrowth[key]);
	}
	return {
		baseGrowth,
		rebirthGrowth,
		raceGrowth,
		additiveGrowth,
		raceBonusPercent,
		growthRates,
		resistances,
		effectAffinity,
		damageBonusPercent,
		sources,
	};
}

export interface PlannerCatalogEntry {
	selection: PathSelection;
	result: PathResult;
}

// Final gender does not change numerical results. Retain the 256 effective
// combinations once, in race/gender order, for scales and the path finder.
const catalog: PlannerCatalogEntry[] = [];
for (const x of races)
	for (const gx of genders)
		for (const y of races)
			for (const gy of genders)
				for (const z of races) {
					const selection: PathSelection = {
						origin: { race: x, gender: gx },
						first: { race: y, gender: gy },
						final: { race: z, gender: 'male' },
					};
					catalog.push({ selection, result: calculatePath(selection) });
				}

/** A detached snapshot: callers may edit selections or results without altering the catalog. */
export function getPathCatalog(): PlannerCatalogEntry[] {
	return catalog.map(({ selection, result }) => ({
		selection: {
			origin: { ...selection.origin },
			first: { ...selection.first },
			final: { ...selection.final },
		},
		result: {
			...result,
			baseGrowth: { ...result.baseGrowth },
			rebirthGrowth: { ...result.rebirthGrowth },
			raceGrowth: { ...result.raceGrowth },
			additiveGrowth: { ...result.additiveGrowth },
			raceBonusPercent: { ...result.raceBonusPercent },
			growthRates: { ...result.growthRates },
			resistances: { ...result.resistances },
			sources: result.sources.map(source => ({
				...source,
				resistances: { ...source.resistances },
				additiveGrowth: { ...source.additiveGrowth },
				raceBonusPercent: { ...source.raceBonusPercent },
			})),
		},
	}));
}

// One scale for the entire catalog: selections never change chart or star scales.
export const GROWTH_CEILINGS: GrowthValues = Object.fromEntries(
	keys.map(key => [
		key,
		Math.ceil(Math.max(...catalog.map(({ result }) => result.growthRates[key]))),
	]),
) as GrowthValues;
export const MAX_PLANNER_AFFINITY = Math.max(...catalog.map(({ result }) => result.effectAffinity));
export const MAX_PLANNER_DAMAGE = Math.max(
	...catalog.map(({ result }) => result.damageBonusPercent),
);

export function bonusLabel(key: string): string {
	if (key === 'pierce') return 'Pierce Rate';
	return key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase());
}

/** All shared and differing values, with B − A deltas and absent bonuses treated as zero. */
export function buildComparisonRows(a: PathResult, b: PathResult): ComparisonRow[] {
	const row = (
		key: string,
		label: string,
		group: ComparisonRow['group'],
		av: number,
		bv: number,
		unit: ComparisonRow['unit'],
	): ComparisonRow => ({
		key,
		label,
		group,
		a: av,
		b: bv,
		delta: Math.round((bv - av) * 1e6) / 1e6,
		unit,
	});
	return [
		...keys.map(key =>
			row(
				key,
				GROWTH_LABELS[key],
				'Growth rates',
				a.growthRates[key],
				b.growthRates[key],
				'growth',
			),
		),
		row(
			'effectAffinity',
			'Effect Affinity',
			'Skill bonuses',
			a.effectAffinity,
			b.effectAffinity,
			'points',
		),
		row(
			'damageBonusPercent',
			'Skill Damage Bonus',
			'Skill bonuses',
			a.damageBonusPercent,
			b.damageBonusPercent,
			'percent',
		),
		...Array.from(new Set([...Object.keys(a.resistances), ...Object.keys(b.resistances)]))
			.sort()
			.map(key =>
				row(
					key,
					bonusLabel(key),
					'Resistance and combat bonuses',
					a.resistances[key] ?? 0,
					b.resistances[key] ?? 0,
					'points',
				),
			),
	];
}
