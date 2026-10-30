import { bonusLabel, calculatePath, getPathCatalog, GROWTH_LABELS } from './planner';
import type { LifeSelection, PathResult, PathSelection, Race } from './planner';
import type { StatKey } from './rebornCombos';

export type LifeKey = 'origin' | 'first' | 'final';
export type LifePins = Record<LifeKey, boolean>;
export type MetricId =
	| `growth:${StatKey}`
	| 'effectAffinity'
	| 'damageBonusPercent'
	| `resistance:${string}`;
export type FinalRaceConstraint = 'same-as-a' | 'any' | Race;

export interface MinimumRequirement {
	metric: MetricId;
	/** Raw input preserves blank and incomplete edits until the user finishes typing. */
	value: string;
}

export interface FinderSettings {
	open: boolean;
	pins: LifePins;
	finalRace: FinalRaceConstraint;
	goal: MetricId | null;
	requirements: MinimumRequirement[];
}

export interface FinderMetric {
	id: MetricId;
	label: string;
	unit: 'growth' | 'points' | 'percent';
	group: string;
}

export interface FinderMatch {
	key: string;
	selection: PathSelection;
	result: PathResult;
	goalValue: number;
	/** The selected goal's value minus its value on Path A. */
	delta: number;
	isCurrent: boolean;
	/** Another eligible route has the same goal value. Distinct routes remain visible. */
	tied: boolean;
}

export interface FinderSearch {
	status: 'idle' | 'invalid' | 'ready';
	errors: Partial<Record<MetricId, string>>;
	matches: FinderMatch[];
}

const lifeKeys: LifeKey[] = ['origin', 'first', 'final'];
const statKeys: StatKey[] = ['strength', 'intelligence', 'agility', 'stamina'];
const resistanceKeys = Array.from(
	new Set(getPathCatalog().flatMap(({ result }) => Object.keys(result.resistances))),
).sort();

export const FINDER_METRICS: readonly FinderMetric[] = Object.freeze(
	[
		...statKeys.map(
			(key): FinderMetric => ({
				id: `growth:${key}`,
				label: GROWTH_LABELS[key],
				unit: 'growth',
				group: 'Growth rates',
			}),
		),
		{
			id: 'effectAffinity',
			label: 'Effect Affinity',
			unit: 'points',
			group: 'Skill bonuses',
		} as FinderMetric,
		{
			id: 'damageBonusPercent',
			label: 'Skill Damage Bonus',
			unit: 'percent',
			group: 'Skill bonuses',
		} as FinderMetric,
		...resistanceKeys.map(
			(key): FinderMetric => ({
				id: `resistance:${key}`,
				label: bonusLabel(key),
				unit: 'points',
				group: 'Resistance and combat bonuses',
			}),
		),
	].map(metric => Object.freeze(metric)),
);

const metricIds = new Set<string>(FINDER_METRICS.map(metric => metric.id));

export function createDefaultFinderSettings(): FinderSettings {
	return {
		open: false,
		pins: { origin: false, first: false, final: false },
		finalRace: 'same-as-a',
		goal: null,
		requirements: [],
	};
}

export function isMetricId(value: unknown): value is MetricId {
	return typeof value === 'string' && metricIds.has(value);
}

export function metricValue(result: PathResult, metric: MetricId): number {
	if (!isMetricId(metric)) throw new RangeError('Choose a valid planning metric.');
	if (metric === 'effectAffinity') return result.effectAffinity;
	if (metric === 'damageBonusPercent') return result.damageBonusPercent;
	if (metric.startsWith('growth:')) return result.growthRates[metric.slice(7) as StatKey];
	return result.resistances[metric.slice(11)] ?? 0;
}

function sameLife(a: LifeSelection, b: LifeSelection): boolean {
	return a.race === b.race && a.gender === b.gender;
}

/** Whether loading B would change any pinned life from A. */
export function pinsConflict(a: PathSelection, b: PathSelection, pins: LifePins): boolean {
	return lifeKeys.some(key => pins[key] && !sameLife(a[key], b[key]));
}

function samePath(a: PathSelection, b: PathSelection): boolean {
	return lifeKeys.every(key => sameLife(a[key], b[key]));
}

function selectionKey(selection: PathSelection): string {
	return lifeKeys
		.map(key => `${selection[key].race}${selection[key].gender === 'male' ? 'm' : 'f'}`)
		.join('-');
}

/** Race enum order, then gender enum order, applied to each life in turn. */
function compareSelections(a: PathSelection, b: PathSelection): number {
	for (const key of lifeKeys) {
		const race = a[key].race - b[key].race;
		if (race !== 0) return race;
		if (a[key].gender !== b[key].gender) return a[key].gender === 'male' ? -1 : 1;
	}
	return 0;
}

const decimalNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Finds every eligible route without mutating Path A, Path B, settings, or the retained catalog. */
export function searchPaths(a: PathSelection, settings: FinderSettings): FinderSearch {
	const errors: FinderSearch['errors'] = {};
	const minima = new Map<MetricId, number>();
	const seen = new Set<MetricId>();
	let invalidMetric = false;
	for (const requirement of settings.requirements) {
		if (!isMetricId(requirement.metric)) {
			invalidMetric = true;
			continue;
		}
		if (seen.has(requirement.metric)) {
			errors[requirement.metric] = 'Add each requirement only once.';
			continue;
		}
		seen.add(requirement.metric);
		const input = typeof requirement.value === 'string' ? requirement.value.trim() : null;
		if (input === '') continue;
		const value = input === null ? NaN : Number(input);
		if (input === null || !decimalNumber.test(input) || !Number.isFinite(value)) {
			errors[requirement.metric] = 'Enter a finite number.';
			continue;
		}
		minima.set(requirement.metric, value);
	}
	const validFinalRace =
		settings.finalRace === 'same-as-a' ||
		settings.finalRace === 'any' ||
		(Number.isInteger(settings.finalRace) &&
			Number(settings.finalRace) >= 0 &&
			Number(settings.finalRace) <= 3);
	if (
		invalidMetric ||
		Object.keys(errors).length > 0 ||
		!validFinalRace ||
		(settings.goal !== null && !isMetricId(settings.goal))
	) {
		return { status: 'invalid', errors, matches: [] };
	}
	if (settings.goal === null) return { status: 'idle', errors, matches: [] };
	const goal = settings.goal;
	const baseline = metricValue(calculatePath(a), goal);
	const finalRace =
		settings.pins.final || settings.finalRace === 'same-as-a'
			? a.final.race
			: settings.finalRace === 'any'
				? null
				: settings.finalRace;
	const requirements = Array.from(minima);
	const matches: FinderMatch[] = [];
	for (const entry of getPathCatalog()) {
		const selection = entry.selection;
		// Gender affects the playable final character, but not the inherited
		// bonuses or growth being ranked. Keep A's choice without duplicate rows.
		selection.final.gender = a.final.gender;
		if (finalRace !== null && selection.final.race !== finalRace) continue;
		if (pinsConflict(a, selection, settings.pins)) continue;
		if (requirements.some(([metric, minimum]) => metricValue(entry.result, metric) < minimum))
			continue;
		const goalValue = metricValue(entry.result, goal);
		matches.push({
			key: selectionKey(selection),
			selection,
			result: entry.result,
			goalValue,
			delta: Math.round((goalValue - baseline) * 1e6) / 1e6,
			isCurrent: samePath(a, selection),
			tied: false,
		});
	}
	matches.sort(
		(left, right) =>
			right.goalValue - left.goalValue || compareSelections(left.selection, right.selection),
	);
	for (let index = 0; index < matches.length; index++) {
		matches[index].tied =
			(index > 0 && matches[index - 1].goalValue === matches[index].goalValue) ||
			(index + 1 < matches.length && matches[index + 1].goalValue === matches[index].goalValue);
	}
	return { status: 'ready', errors, matches };
}
