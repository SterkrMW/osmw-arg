import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePath, getPathCatalog } from '../src/planner';
import type { PathResult, PathSelection, Race } from '../src/planner';
import type { StatKey } from '../src/rebornCombos';
import {
	createDefaultFinderSettings,
	FINDER_METRICS,
	isMetricId,
	metricValue,
	pinsConflict,
	searchPaths,
} from '../src/pathFinder';
import type { FinderSettings, LifeKey, LifePins, MetricId } from '../src/pathFinder';

const lifeKeys: LifeKey[] = ['origin', 'first', 'final'];
const source: PathSelection = {
	origin: { race: 3, gender: 'male' },
	first: { race: 3, gender: 'female' },
	final: { race: 3, gender: 'female' },
};
const settings = (changes: Partial<FinderSettings> = {}): FinderSettings => ({
	...createDefaultFinderSettings(),
	finalRace: 'any',
	goal: 'growth:strength',
	...changes,
});
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tuple = (selection: PathSelection): number[] =>
	lifeKeys.flatMap(key => [selection[key].race, selection[key].gender === 'male' ? 0 : 1]);
const compareTuple = (a: PathSelection, b: PathSelection): number => {
	const left = tuple(a);
	const right = tuple(b);
	for (let index = 0; index < left.length; index++)
		if (left[index] !== right[index]) return left[index] - right[index];
	return 0;
};

// Deliberately rebuild from calculatePath rather than consulting the retained
// catalogue or metricValue, so a finder lookup/cache regression cannot self-pass.
function oraclePaths(): { selection: PathSelection; result: PathResult }[] {
	const paths: { selection: PathSelection; result: PathResult }[] = [];
	for (let origin = 0; origin < 4; origin++)
		for (const originGender of ['male', 'female'] as const)
			for (let first = 0; first < 4; first++)
				for (const firstGender of ['male', 'female'] as const)
					for (let final = 0; final < 4; final++) {
						const selection: PathSelection = {
							origin: { race: origin as Race, gender: originGender },
							first: { race: first as Race, gender: firstGender },
							final: { race: final as Race, gender: source.final.gender },
						};
						paths.push({ selection, result: calculatePath(selection) });
					}
	return paths;
}

function oracleValue(result: PathResult, metric: MetricId): number {
	const [group, key] = metric.split(':');
	if (group === 'growth') return result.growthRates[key as StatKey];
	if (group === 'resistance') return result.resistances[key] ?? 0;
	return metric === 'effectAffinity' ? result.effectAffinity : result.damageBonusPercent;
}

test('defaults require an explicit goal and start without pins', () => {
	const defaults = createDefaultFinderSettings();
	assert.deepEqual(defaults, {
		open: false,
		pins: { origin: false, first: false, final: false },
		finalRace: 'same-as-a',
		goal: null,
		requirements: [],
	});
	assert.deepEqual(searchPaths(source, defaults), { status: 'idle', errors: {}, matches: [] });
	defaults.pins.origin = true;
	defaults.requirements.push({ metric: 'effectAffinity', value: '5' });
	assert.equal(createDefaultFinderSettings().pins.origin, false);
	assert.deepEqual(createDefaultFinderSettings().requirements, []);
});

test('retained catalog covers every effective path and preserves the existing calculation', () => {
	const catalog = getPathCatalog();
	assert.equal(catalog.length, 256);
	assert.equal(new Set(catalog.map(entry => JSON.stringify(tuple(entry.selection)))).size, 256);
	for (const [index, entry] of catalog.entries()) {
		assert.deepEqual(entry.result, calculatePath(entry.selection));
		assert.equal(entry.selection.final.gender, 'male');
		if (index > 0) assert.ok(compareTuple(catalog[index - 1].selection, entry.selection) < 0);
	}
});

test('searches 256 any-race or 64 fixed-race paths, carrying the final gender', () => {
	for (const gender of ['male', 'female'] as const) {
		const a = { ...source, final: { ...source.final, gender } };
		const any = searchPaths(a, settings());
		assert.equal(any.status, 'ready');
		assert.equal(any.matches.length, 256);
		assert.equal(new Set(any.matches.map(match => match.key)).size, 256);
		assert.equal(any.matches.filter(match => match.isCurrent).length, 1);
		assert.deepEqual(any.matches.find(match => match.isCurrent)?.selection, a);
		assert.equal(any.matches.find(match => match.isCurrent)?.delta, 0);
		assert.ok(any.matches.every(match => match.selection.final.gender === gender));
		for (const finalRace of ['same-as-a', 0, 1, 2, 3] as const) {
			const fixed = searchPaths(a, settings({ finalRace }));
			assert.equal(fixed.matches.length, 64);
			assert.ok(
				fixed.matches.every(
					match =>
						match.selection.final.race === (finalRace === 'same-as-a' ? a.final.race : finalRace),
				),
			);
		}
	}
});

test('all eight pin masks constrain every source path and both final genders', () => {
	let cases = 0;
	for (const { selection } of getPathCatalog()) {
		for (const gender of ['male', 'female'] as const) {
			const a = { ...selection, final: { ...selection.final, gender } };
			for (let mask = 0; mask < 8; mask++) {
				const pins: LifePins = {
					origin: Boolean(mask & 1),
					first: Boolean(mask & 2),
					final: Boolean(mask & 4),
				};
				const result = searchPaths(a, settings({ pins }));
				const expectedCount =
					256 / (pins.origin ? 8 : 1) / (pins.first ? 8 : 1) / (pins.final ? 4 : 1);
				assert.equal(result.status, 'ready');
				assert.equal(result.matches.length, expectedCount);
				assert.equal(result.matches.filter(match => match.isCurrent).length, 1);
				for (const match of result.matches) {
					assert.equal(match.selection.final.gender, gender);
					for (const key of lifeKeys) if (pins[key]) assert.deepEqual(match.selection[key], a[key]);
				}
				cases++;
			}
		}
	}
	assert.equal(cases, 4096);
});

test('a final pin overrides the separate final-race setting', () => {
	const result = searchPaths(
		source,
		settings({
			pins: { origin: false, first: false, final: true },
			finalRace: 0,
		}),
	);
	assert.equal(result.matches.length, 64);
	assert.ok(result.matches.every(match => match.selection.final.race === source.final.race));
});

test('pin conflict checks both race and gender for every pinned life', () => {
	for (const key of lifeKeys) {
		const pins = { origin: false, first: false, final: false };
		pins[key] = true;
		assert.equal(pinsConflict(source, copy(source), pins), false);
		const changedGender = copy(source);
		changedGender[key].gender = source[key].gender === 'male' ? 'female' : 'male';
		assert.equal(pinsConflict(source, changedGender, pins), true);
		const changedRace = copy(source);
		changedRace[key].race = ((source[key].race + 1) % 4) as Race;
		assert.equal(pinsConflict(source, changedRace, pins), true);
		pins[key] = false;
		assert.equal(pinsConflict(source, changedRace, pins), false);
		assert.equal(pinsConflict(source, changedGender, pins), false);
	}
});

test('metrics contain every available bonus, use the right units, and reject unknown IDs', () => {
	assert.equal(FINDER_METRICS.length, new Set(FINDER_METRICS.map(metric => metric.id)).size);
	const result = calculatePath(source);
	for (const metric of FINDER_METRICS) {
		assert.equal(isMetricId(metric.id), true);
		assert.ok(Number.isFinite(metricValue(result, metric.id)));
	}
	for (const { result: entry } of getPathCatalog()) {
		for (const key of Object.keys(entry.resistances))
			assert.equal(isMetricId(`resistance:${key}`), true);
	}
	assert.equal(FINDER_METRICS.find(metric => metric.id === 'effectAffinity')?.unit, 'points');
	assert.equal(FINDER_METRICS.find(metric => metric.id === 'damageBonusPercent')?.unit, 'percent');
	assert.equal(FINDER_METRICS.find(metric => metric.id === 'growth:agility')?.unit, 'growth');
	for (const id of [
		'growth:luck',
		'resistance:unknown',
		'resistance:__proto__',
		'effectAffinity ',
		'',
		null,
		1,
	])
		assert.equal(isMetricId(id), false);
	assert.throws(() => metricValue(result, 'resistance:unknown'), RangeError);
});

test('inclusive minima preserve negative values and treat absent bonuses as zero', () => {
	const minimum = (metric: MetricId, value: string) =>
		searchPaths(source, settings({ requirements: [{ metric, value }] }));
	assert.equal(minimum('resistance:hitRate', '-5').matches.length, 256);
	const zero = minimum('resistance:hitRate', '0');
	assert.equal(zero.matches.length, 240);
	assert.ok(zero.matches.some(match => match.result.resistances.hitRate === undefined));
	assert.ok(zero.matches.every(match => metricValue(match.result, 'resistance:hitRate') >= 0));
	assert.equal(minimum('resistance:hitRate', '20').matches.length, 16);
	assert.equal(minimum('resistance:hitRate', '20.000001').matches.length, 0);
	const ceiling = minimum('growth:strength', '3.625');
	assert.equal(ceiling.matches.length, 1);
	assert.equal(ceiling.matches[0].goalValue, 3.625);
	assert.equal(minimum('growth:strength', '3.625001').matches.length, 0);
	assert.equal(minimum('effectAffinity', '0').matches.length, 256);
	assert.equal(minimum('effectAffinity', '-0').matches.length, 256);
	assert.equal(minimum('effectAffinity', '1.5e1').matches.length, 4);
	const conjunction = searchPaths(
		source,
		settings({
			requirements: [
				{ metric: 'effectAffinity', value: '15' },
				{ metric: 'damageBonusPercent', value: '9' },
			],
		}),
	);
	assert.equal(conjunction.status, 'ready');
	assert.equal(conjunction.matches.length, 0);
});

test('blank minima are ignored while invalid or duplicate fields return no usable matches', () => {
	for (const value of ['', ' ', '\t\n']) {
		const result = searchPaths(
			source,
			settings({ requirements: [{ metric: 'effectAffinity', value }] }),
		);
		assert.equal(result.status, 'ready');
		assert.equal(result.matches.length, 256);
	}
	for (const value of [
		'-',
		'+',
		'.',
		'1e',
		'NaN',
		'Infinity',
		'-Infinity',
		'1e9999',
		'0x10',
		'ten',
		'1,000',
		'1 2',
	]) {
		const result = searchPaths(
			source,
			settings({ requirements: [{ metric: 'effectAffinity', value }] }),
		);
		assert.equal(result.status, 'invalid', value);
		assert.ok(result.errors.effectAffinity);
		assert.deepEqual(result.matches, []);
	}
	const duplicate = searchPaths(
		source,
		settings({
			requirements: [
				{ metric: 'effectAffinity', value: '3' },
				{ metric: 'effectAffinity', value: '' },
			],
		}),
	);
	assert.equal(duplicate.status, 'invalid');
	assert.match(duplicate.errors.effectAffinity ?? '', /once/);
	assert.equal(
		searchPaths(
			source,
			settings({ goal: null, requirements: [{ metric: 'effectAffinity', value: '-' }] }),
		).status,
		'invalid',
	);
	assert.equal(
		searchPaths(
			source,
			settings({ goal: null, requirements: [{ metric: 'effectAffinity', value: '3' }] }),
		).status,
		'idle',
	);
	assert.equal(
		searchPaths(source, settings({ goal: 'growth:unknown' as MetricId })).status,
		'invalid',
	);
	assert.equal(searchPaths(source, settings({ finalRace: 4 as Race })).status, 'invalid');
	assert.equal(
		searchPaths(source, settings({ requirements: [{ metric: 'resistance:unknown', value: '0' }] }))
			.status,
		'invalid',
	);
});

test('ranking keeps distinct tied routes in stable race/gender order with accurate deltas', () => {
	const result = searchPaths(source, settings({ goal: 'effectAffinity' }));
	assert.equal(result.matches.length, 256);
	assert.deepEqual(
		result.matches.slice(0, 4).map(match => tuple(match.selection)),
		[
			[2, 0, 0, 0, 0, 1],
			[2, 0, 0, 1, 0, 1],
			[2, 1, 0, 0, 0, 1],
			[2, 1, 0, 1, 0, 1],
		],
	);
	const baseline = metricValue(calculatePath(source), 'effectAffinity');
	for (const [index, match] of result.matches.entries()) {
		assert.equal(match.delta, match.goalValue - baseline);
		assert.equal(
			match.tied,
			result.matches.some(other => other.key !== match.key && other.goalValue === match.goalValue),
		);
		if (index > 0) {
			const previous = result.matches[index - 1];
			assert.ok(previous.goalValue >= match.goalValue);
			if (previous.goalValue === match.goalValue)
				assert.ok(compareTuple(previous.selection, match.selection) < 0);
		}
	}
	assert.deepEqual(searchPaths(source, settings({ goal: 'effectAffinity' })), result);
	const one = searchPaths(source, settings({ pins: { origin: true, first: true, final: true } }));
	assert.equal(one.matches[0].tied, false);
	assert.equal(one.matches[0].isCurrent, true);
	assert.equal(one.matches[0].delta, 0);
	const excludesCurrent = searchPaths(
		source,
		settings({ requirements: [{ metric: 'resistance:hitRate', value: '0' }] }),
	);
	assert.equal(
		excludesCurrent.matches.some(match => match.isCurrent),
		false,
	);
});

test('every selectable goal ranks all 256 independently calculated paths and exact raw values', () => {
	const oracle = oraclePaths();
	const baseline = calculatePath(source);
	for (const metric of FINDER_METRICS) {
		const result = searchPaths(source, settings({ goal: metric.id }));
		const expected = [...oracle].sort(
			(a, b) =>
				oracleValue(b.result, metric.id) - oracleValue(a.result, metric.id) ||
				compareTuple(a.selection, b.selection),
		);
		assert.equal(result.status, 'ready', metric.id);
		assert.equal(result.matches.length, 256, metric.id);
		for (const [index, match] of result.matches.entries()) {
			const value = oracleValue(expected[index].result, metric.id);
			assert.deepEqual(match.selection, expected[index].selection, metric.id);
			assert.deepEqual(match.result, expected[index].result, metric.id);
			assert.equal(match.goalValue, value, metric.id);
			assert.equal(
				match.delta,
				Math.round((value - oracleValue(baseline, metric.id)) * 1e6) / 1e6,
				metric.id,
			);
		}
	}
});

test('every metric minimum is inclusive at every attainable value, including absent-zero bonuses', () => {
	const oracle = oraclePaths();
	for (const metric of FINDER_METRICS) {
		const ordered = [...oracle].sort(
			(a, b) =>
				oracleValue(b.result, metric.id) - oracleValue(a.result, metric.id) ||
				compareTuple(a.selection, b.selection),
		);
		const values = Array.from(new Set(ordered.map(entry => oracleValue(entry.result, metric.id))));
		for (const minimum of [...values, Math.max(...values) + 0.000001]) {
			const expected = ordered.filter(entry => oracleValue(entry.result, metric.id) >= minimum);
			const result = searchPaths(
				source,
				settings({
					goal: metric.id,
					requirements: [{ metric: metric.id, value: String(minimum) }],
				}),
			);
			assert.equal(result.status, 'ready', `${metric.id} >= ${minimum}`);
			assert.deepEqual(
				result.matches.map(match => match.selection),
				expected.map(entry => entry.selection),
				`${metric.id} >= ${minimum}`,
			);
			assert.deepEqual(
				result.matches.map(match => match.goalValue),
				expected.map(entry => oracleValue(entry.result, metric.id)),
				`${metric.id} >= ${minimum}`,
			);
		}
	}
});

test('search and returned snapshots cannot mutate inputs, another search, or the retained catalog', () => {
	const a = copy(source);
	const options = settings({ requirements: [{ metric: 'effectAffinity', value: '0' }] });
	const inputsBefore = copy({ a, options });
	const catalogBefore = getPathCatalog();
	const expected = searchPaths(a, options);
	const changed = searchPaths(a, options);
	assert.deepEqual({ a, options }, inputsBefore);
	const match = changed.matches[0];
	match.selection.origin.race = 0;
	match.selection.final.gender = 'male';
	match.result.growthRates.strength = 99;
	match.result.baseGrowth.strength = 99;
	match.result.rebirthGrowth.strength = 99;
	match.result.raceGrowth.strength = 99;
	match.result.additiveGrowth.strength = 99;
	match.result.raceBonusPercent.strength = 99;
	match.result.resistances.hitRate = 99;
	match.result.sources[0].resistances.hitRate = 99;
	match.result.sources[0].additiveGrowth.strength = 99;
	match.result.sources[0].raceBonusPercent.strength = 99;
	changed.matches.reverse();
	assert.deepEqual(searchPaths(a, options), expected);
	assert.deepEqual(getPathCatalog(), catalogBefore);
	const snapshot = getPathCatalog();
	snapshot[0].selection.first.gender = 'female';
	snapshot[0].result.sources[0].additiveGrowth.stamina = 99;
	assert.deepEqual(getPathCatalog(), catalogBefore);
	assert.deepEqual({ a, options }, inputsBefore);
});
