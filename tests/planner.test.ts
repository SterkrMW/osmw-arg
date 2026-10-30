import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	buildComparisonRows,
	calculatePath,
	GROWTH_CEILINGS,
	GROWTH_DECIMALS,
	MAX_PLANNER_AFFINITY,
	MAX_PLANNER_DAMAGE,
} from '../src/planner';
import type { PathSelection, Race } from '../src/planner';
import type { Gender, StatKey } from '../src/rebornCombos';

const races: Race[] = [0, 1, 2, 3];
const genders: Gender[] = ['male', 'female'];
const stats: StatKey[] = ['strength', 'intelligence', 'agility', 'stamina'];
const path = (
	x: Race,
	y: Race,
	z: Race,
	gx: Gender = 'male',
	gy: Gender = 'male',
	gz: Gender = 'male',
): PathSelection => ({
	origin: { race: x, gender: gx },
	first: { race: y, gender: gy },
	final: { race: z, gender: gz },
});
const round = (value: number): number => Math.round(value * 1000) / 1000;

test('shows actual Human growth rather than the old normalized radar scores', () => {
	const result = calculatePath(path(0, 0, 0));
	assert.deepEqual(result.baseGrowth, {
		strength: 1,
		intelligence: 1.05,
		agility: 0.75,
		stamina: 1.08,
	});
	assert.deepEqual(result.growthRates, {
		strength: 1.1,
		intelligence: 0.955,
		agility: 0.625,
		stamina: 1.944,
	});
	assert.equal(result.raceBonusPercent.stamina, 30);
	assert.equal(result.additiveGrowth.stamina, 0.4);
	assert.equal(result.effectAffinity, 10);
	assert.equal(result.damageBonusPercent, 10);
});

test('matches setter rounding at each stage, including a half-boundary regression', () => {
	const result = calculatePath(path(0, 3, 2));
	assert.equal(result.baseGrowth.strength, 0.7);
	assert.equal(result.rebirthGrowth.strength, 0.77);
	assert.equal(result.raceGrowth.strength, 0.886);
	assert.equal(result.additiveGrowth.strength, 0.1);
	assert.equal(result.growthRates.strength, 0.986);
	assert.notEqual(result.growthRates.strength, round(0.7 * 1.1 * 1.15 + 0.1));
});

test('historical genders resolve independently and both same-race bonuses are conditional', () => {
	const mixed = calculatePath(path(0, 2, 2, 'male', 'female'));
	assert.equal(mixed.resistances.frailtyResist, 12);
	assert.equal(mixed.resistances.fireResist, 4);
	assert.equal(mixed.resistances.iceResist, 16);
	assert.equal(mixed.effectAffinity, 7);
	assert.equal(mixed.damageBonusPercent, 11);
	assert.equal(mixed.sources.find(source => source.id === 'first-same-race')?.active, false);
	assert.equal(mixed.sources.find(source => source.id === 'second-same-race')?.active, true);
	const differentFinal = calculatePath(path(0, 2, 1, 'male', 'female'));
	assert.equal(differentFinal.effectAffinity, 2);
	assert.equal(differentFinal.damageBonusPercent, 4);
	assert.notDeepEqual(differentFinal.growthRates, mixed.growthRates);
});

test('retains negative penalties and additive versus percentage contributions', () => {
	const borg = calculatePath(path(3, 3, 3));
	assert.equal(borg.resistances.hitRate, -5);
	assert.equal(borg.growthRates.strength, 3.625);
	assert.equal(borg.raceBonusPercent.strength, 30);
	assert.equal(borg.additiveGrowth.strength, 0.55);
	assert.equal(borg.resistances.criticalRate, 54);
	const mixedGender = calculatePath(path(3, 3, 3, 'male', 'female'));
	assert.equal(mixedGender.growthRates.strength, 3.525);
	assert.equal(mixedGender.growthRates.intelligence, 1.145);
});

test('all 256 histories reconcile source contributions and ignore final gender', () => {
	let count = 0;
	for (const x of races)
		for (const y of races)
			for (const z of races) {
				for (const gx of genders)
					for (const gy of genders) {
						const result = calculatePath(path(x, y, z, gx, gy));
						assert.deepEqual(calculatePath(path(x, y, z, gx, gy, 'female')), result);
						for (const key of stats) {
							assert.equal(
								round(result.sources.reduce((sum, source) => sum + source.additiveGrowth[key], 0)),
								result.additiveGrowth[key],
							);
							assert.equal(
								result.sources.reduce((sum, source) => sum + source.raceBonusPercent[key], 0),
								result.raceBonusPercent[key],
							);
							assert.ok(Number.isFinite(result.growthRates[key]));
							assert.ok(result.growthRates[key] <= GROWTH_CEILINGS[key]);
						}
						const resistances: Record<string, number> = {};
						for (const source of result.sources)
							for (const [key, value] of Object.entries(source.resistances))
								resistances[key] = (resistances[key] ?? 0) + value;
						for (const key of Object.keys(resistances))
							if (resistances[key] === 0) delete resistances[key];
						assert.deepEqual(resistances, result.resistances);
						assert.equal(
							result.sources.reduce((sum, source) => sum + source.effectAffinity, 0),
							result.effectAffinity,
						);
						assert.equal(
							result.sources.reduce((sum, source) => sum + source.damageBonusPercent, 0),
							result.damageBonusPercent,
						);
						for (const source of result.sources.filter(source => !source.active)) {
							assert.deepEqual(source.resistances, {});
							assert.equal(source.effectAffinity, 0);
							assert.equal(source.damageBonusPercent, 0);
						}
						count++;
					}
			}
	assert.equal(count, 256);
});

test('uses catalog-wide graph and star ceilings', () => {
	assert.equal(GROWTH_DECIMALS, 3);
	assert.deepEqual(GROWTH_CEILINGS, { strength: 4, intelligence: 2, agility: 2, stamina: 2 });
	assert.equal(MAX_PLANNER_AFFINITY, 15);
	assert.equal(MAX_PLANNER_DAMAGE, 17);
});

test('comparison aligns missing bonuses, retains ties, and calculates signed B minus A', () => {
	const a = calculatePath(path(3, 3, 3));
	const b = calculatePath(path(0, 0, 0));
	const rows = buildComparisonRows(a, b);
	assert.equal(rows.find(row => row.key === 'strength')?.delta, -2.525);
	assert.equal(rows.find(row => row.key === 'drainResist')?.b, 0);
	assert.equal(rows.find(row => row.key === 'hitRate')?.delta, 5);
	assert.equal(rows.find(row => row.key === 'effectAffinity')?.unit, 'points');
	assert.equal(rows.find(row => row.key === 'damageBonusPercent')?.unit, 'percent');
	assert.ok(buildComparisonRows(a, a).every(row => row.delta === 0));
	assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
});

test('returned results cannot mutate presets or another calculation', () => {
	const selection = path(0, 0, 0);
	const expected = calculatePath(selection);
	const changed = calculatePath(selection);
	changed.baseGrowth.strength = 99;
	changed.resistances.frailtyResist = 99;
	changed.sources[0].resistances.frailtyResist = 99;
	changed.sources[0].additiveGrowth.strength = 99;
	assert.deepEqual(calculatePath(selection), expected);
});

test('rejects malformed race and gender input', () => {
	assert.throws(
		() => calculatePath({ ...path(0, 0, 0), first: { race: 4 as Race, gender: 'male' } }),
		RangeError,
	);
	assert.throws(
		() => calculatePath({ ...path(0, 0, 0), final: { race: 0, gender: 'unknown' as Gender } }),
		RangeError,
	);
});
