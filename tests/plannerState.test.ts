import assert from 'node:assert/strict';
import test from 'node:test';
import {
	clonePath, copyAToB, createDefaultDraft, initializePlanner, loadPlannerDraft,
	makePlannerUrl, parsePlannerUrl, parseStoredDraft, PLANNER_STORAGE_KEY,
	savePlannerDraft, toggleComparison, LEGACY_PLANNER_STORAGE_KEY,
	toggleLifePin, updatePathA, applyFinderCandidate,
} from '../src/plannerState.ts';
import { createDefaultFinderSettings, searchPaths } from '../src/pathFinder.ts';

const baseUrl = 'https://example.test/';

test('fresh paths and chart defaults do not share mutable selections', () => {
	const a = createDefaultDraft();
	const b = createDefaultDraft();
	assert.equal(a.comparing, false);
	assert.equal(a.showChartValues, true);
	assert.equal(a.b, null);
	a.a.origin.race = 3;
	assert.equal(b.a.origin.race, 0);
	assert.equal(a.a.first.race, 0);
});

test('compare clones A once, retains edited B on hide/reopen, and explicitly replaces it', () => {
	const original = createDefaultDraft();
	const compare = toggleComparison(original);
	assert.equal(compare.comparing, true);
	assert.deepEqual(compare.b, original.a);
	assert.notEqual(compare.a.origin, compare.b!.origin);
	compare.b!.first.race = 3;
	compare.b!.first.gender = 'female';
	assert.equal(original.a.first.race, 0);
	const closed = toggleComparison(compare);
	assert.equal(closed.comparing, false);
	const reopened = toggleComparison(closed);
	assert.deepEqual(reopened.b, compare.b);
	const replaced = copyAToB(reopened);
	assert.deepEqual(replaced.b, replaced.a);
	assert.notEqual(replaced.b!.first, replaced.a.first);
	assert.equal(compare.b!.first.race, 3);
});

test('draft storage round-trips all selections, hidden B and the chart preference', () => {
	let stored: string | null = null;
	const storage = {
		getItem(key: string) { assert.equal(key, PLANNER_STORAGE_KEY); return stored; },
		setItem(key: string, value: string) { assert.equal(key, PLANNER_STORAGE_KEY); stored = value; },
	};
	const draft = toggleComparison(createDefaultDraft());
	draft.a.origin.gender = 'female';
	draft.b!.final.race = 2;
	draft.b!.final.gender = 'female';
	draft.comparing = false;
	draft.showChartValues = false;
	savePlannerDraft(storage, draft);
	assert.deepEqual(loadPlannerDraft(storage), draft);
	assert.deepEqual(initializePlanner(baseUrl, storage), {
		draft, mode: 'wall', shared: false, notice: null,
	});
});

test('malformed or unsupported storage is rejected as a whole', () => {
	const valid = createDefaultDraft();
	for (const value of [null, 'null', '{', '[]', JSON.stringify({ ...valid, version: 3 }),
		JSON.stringify({ ...valid, comparing: true }),
		JSON.stringify({ ...valid, showChartValues: 'true' }),
		JSON.stringify({ ...valid, a: { ...valid.a, origin: { race: 4, gender: 'male' } } }),
		JSON.stringify({ ...valid, a: { ...valid.a, final: { race: 0, gender: 'unknown' } } })]) {
		assert.equal(parseStoredDraft(value), null);
	}
});

test('disabled storage and quota failures leave defaults and updates usable', () => {
	const denied = { getItem(): never { throw new Error('disabled'); }, setItem(): never { throw new Error('quota'); } };
	assert.deepEqual(loadPlannerDraft(denied), createDefaultDraft());
	assert.deepEqual(loadPlannerDraft(null), createDefaultDraft());
	assert.doesNotThrow(() => savePlannerDraft(denied, createDefaultDraft()));
	assert.doesNotThrow(() => savePlannerDraft(null, createDefaultDraft()));
});

test('history navigation retains current drafts without storage while links override only selections', () => {
	const current = toggleComparison(createDefaultDraft());
	current.a.final.race = 3;
	current.b!.origin.gender = 'female';
	current.showChartValues = false;
	const plain = initializePlanner(baseUrl, null, current);
	assert.equal(plain.mode, 'wall');
	assert.deepEqual(plain.draft, current);
	const invalid = initializePlanner(`${baseUrl}?planner=1&a=bad`, null, current);
	assert.deepEqual(invalid.draft, current);
	const shared = initializePlanner(`${baseUrl}?planner=1&a=2f-1m-0f`, null, current);
	assert.equal(shared.draft.a.origin.race, 2);
	assert.equal(shared.draft.showChartValues, false);
	assert.equal(shared.draft.comparing, false);
	assert.deepEqual(current.b!.origin, { race: 0, gender: 'female' });
});

test('every complete path including final gender round-trips through sharing', () => {
	for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
		for (const gx of ['male', 'female'] as const) for (const gy of ['male', 'female'] as const) {
			for (const gz of ['male', 'female'] as const) {
				const draft = createDefaultDraft();
				draft.a = { origin: { race: x as 0, gender: gx }, first: { race: y as 0, gender: gy }, final: { race: z as 0, gender: gz } };
				assert.deepEqual(parsePlannerUrl(makePlannerUrl(baseUrl, draft)), { status: 'valid', a: draft.a, b: null });
			}
		}
	}
});

test('comparison links reproduce both paths; single links omit retained B and presentation', () => {
	const draft = toggleComparison(createDefaultDraft());
	draft.b!.first = { race: 3, gender: 'female' };
	draft.showChartValues = false;
	const url = makePlannerUrl(`${baseUrl}?campaign=rebirth#old`, draft);
	assert.deepEqual(parsePlannerUrl(url), { status: 'valid', a: draft.a, b: draft.b });
	assert.equal(new URL(url).searchParams.get('campaign'), 'rebirth');
	assert.equal(new URL(url).hash, '');
	assert.equal(new URL(url).searchParams.has('showChartValues'), false);
	draft.comparing = false;
	const single = makePlannerUrl(url, draft);
	assert.equal(new URL(single).searchParams.has('b'), false);
	assert.deepEqual(parsePlannerUrl(single), { status: 'valid', a: draft.a, b: null });
});

test('valid links take precedence but keep the viewer chart preference', () => {
	const saved = toggleComparison(createDefaultDraft());
	saved.showChartValues = false;
	saved.b!.final.race = 3;
	const shared = createDefaultDraft();
	shared.a.first = { race: 2, gender: 'female' };
	const initial = initializePlanner(makePlannerUrl(baseUrl, shared), { getItem: () => JSON.stringify(saved) });
	assert.equal(initial.mode, 'builder');
	assert.equal(initial.shared, true);
	assert.equal(initial.notice, null);
	assert.deepEqual(initial.draft.a, shared.a);
	assert.equal(initial.draft.b, null);
	assert.equal(initial.draft.comparing, false);
	assert.equal(initial.draft.showChartValues, false);
});

test('invalid links never partially substitute races or genders', () => {
	const invalid = [
		'?planner=2&a=0m-0m-0m', '?planner=1', '?planner=1&a=0m-0m-4m',
		'?planner=1&a=0m-0m-0x', '?planner=1&a=0m-0m-0m&b=',
		'?planner=1&a=0m-0m-0m&b=bad', '?planner=1&a=0m-0m-0m&a=1m-1m-1m',
		'?planner=1&planner=1&a=0m-0m-0m', '?planner=1&a=0m-0m-0m&b=0m-0m-0m&b=1m-1m-1m',
	];
	const saved = createDefaultDraft();
	saved.a.origin.race = 3;
	for (const query of invalid) {
		assert.deepEqual(parsePlannerUrl(baseUrl + query), { status: 'invalid' });
		const restored = initializePlanner(baseUrl + query, { getItem: () => JSON.stringify(saved) });
		assert.deepEqual(restored.draft, saved);
		assert.equal(restored.mode, 'builder');
		assert.equal(restored.shared, false);
		assert.match(restored.notice!, /could not be opened/);
	}
	assert.deepEqual(parsePlannerUrl(baseUrl), { status: 'none' });
	assert.deepEqual(parsePlannerUrl('not a URL'), { status: 'invalid' });
});

test('stored path copies retain only supported fields', () => {
	const path = createDefaultDraft().a;
	assert.deepEqual(clonePath({ ...path, name: 'ignored' } as typeof path), path);
});

test('v1 drafts migrate all existing selections and preferences with fresh finder settings', () => {
	const current = toggleComparison(createDefaultDraft());
	current.a.origin = { race: 2, gender: 'female' };
	current.b!.final = { race: 3, gender: 'female' };
	current.showChartValues = false;
	const { finder: _finder, ...base } = current;
	const legacy = { ...base, version: 1 };
	assert.deepEqual(parseStoredDraft(JSON.stringify(legacy)), current);
	const reads: string[] = [];
	const stored = new Map([[LEGACY_PLANNER_STORAGE_KEY, JSON.stringify(legacy)]]);
	const storage = {
		getItem(key: string) { reads.push(key); return stored.get(key) ?? null; },
		setItem(key: string, value: string) { stored.set(key, value); },
	};
	const restored = loadPlannerDraft(storage);
	assert.deepEqual(restored, current);
	assert.deepEqual(reads, [PLANNER_STORAGE_KEY, LEGACY_PLANNER_STORAGE_KEY]);
	savePlannerDraft(storage, restored);
	assert.equal(JSON.parse(stored.get(PLANNER_STORAGE_KEY)!).version, 2);
	assert.deepEqual(JSON.parse(stored.get(LEGACY_PLANNER_STORAGE_KEY)!), legacy);
});

test('v2 drafts take precedence and persist every finder control including invalid text', () => {
	let draft = createDefaultDraft();
	draft = toggleLifePin(draft, 'origin');
	draft.finder.open = true;
	draft.finder.goal = 'growth:agility';
	draft.finder.finalRace = 'any';
	draft.finder.requirements = [
		{ metric: 'resistance:chaosResist', value: '-5' },
		{ metric: 'growth:stamina', value: 'unfinished' },
		{ metric: 'effectAffinity', value: '' },
	];
	const saved = JSON.stringify(draft);
	assert.deepEqual(parseStoredDraft(saved), draft);
	assert.deepEqual(loadPlannerDraft({ getItem: (key) => key === PLANNER_STORAGE_KEY ? saved : null }), draft);
	assert.deepEqual(initializePlanner(baseUrl, { getItem: () => saved }).draft.finder, draft.finder);
});

test('malformed finder metadata is rejected instead of silently weakening a search', () => {
	const draft = createDefaultDraft();
	const finders = [
		null,
		{ ...draft.finder, open: 'true' },
		{ ...draft.finder, goal: 'unknown' },
		{ ...draft.finder, pins: { origin: false, first: false } },
		{ ...draft.finder, finalRace: 4 },
		{ ...draft.finder, requirements: [{ metric: 'effectAffinity', value: 10 }] },
		{ ...draft.finder, requirements: [{ metric: 'resistance:invented', value: '1' }] },
		{ ...draft.finder, requirements: [{ metric: 'effectAffinity', value: '1' }, { metric: 'effectAffinity', value: '2' }] },
	];
	for (const finder of finders) assert.equal(parseStoredDraft(JSON.stringify({ ...draft, finder })), null);
	const { finder: _finder, ...missing } = draft;
	assert.equal(parseStoredDraft(JSON.stringify(missing)), null);
});

test('valid shared v1 URLs reset local pins and searches while preserving chart preference', () => {
	let draft = toggleComparison(createDefaultDraft());
	draft = toggleLifePin(draft, 'first');
	draft.finder.goal = 'growth:strength';
	draft.finder.open = true;
	draft.finder.finalRace = 3;
	draft.finder.requirements = [{ metric: 'effectAffinity', value: '999' }];
	draft.showChartValues = false;
	const restored = initializePlanner(`${baseUrl}?planner=1&a=2f-1m-0f&b=3m-3f-3m`, null, draft);
	assert.deepEqual(restored.draft.finder, createDefaultFinderSettings());
	assert.equal(restored.draft.showChartValues, false);
	assert.equal(restored.draft.comparing, true);
	assert.equal(restored.draft.a.first.race, 1);
	assert.equal(restored.draft.b!.origin.race, 3);
	assert.equal(draft.finder.pins.first, true);
	const url = new URL(makePlannerUrl(baseUrl, draft));
	assert.deepEqual([...url.searchParams.keys()].sort(), ['a', 'b', 'planner']);
});

test('pins freeze A race and gender without rewriting B, and final pin resets the race constraint', () => {
	let draft = toggleComparison(createDefaultDraft());
	draft.b!.origin.race = 3;
	draft.finder.finalRace = 'any';
	draft = toggleLifePin(draft, 'origin');
	const selection = clonePath(draft.a);
	selection.origin = { race: 2, gender: 'female' };
	selection.first = { race: 1, gender: 'female' };
	const changed = updatePathA(draft, selection);
	assert.deepEqual(changed.a.origin, draft.a.origin);
	assert.deepEqual(changed.a.first, selection.first);
	assert.equal(changed.b, draft.b);
	draft = toggleLifePin(changed, 'final');
	assert.equal(draft.finder.finalRace, 'same-as-a');
	assert.equal(draft.b!.origin.race, 3);
	const unpinned = toggleLifePin(draft, 'final');
	assert.equal(unpinned.finder.pins.final, false);
	assert.equal(unpinned.finder.finalRace, 'same-as-a');
	assert.equal(unpinned.b, draft.b);
	const unlocked = toggleLifePin(changed, 'origin');
	assert.deepEqual(updatePathA(unlocked, selection).a, selection);
});

test('only explicitly selected current search candidates replace B, with independent copies', () => {
	const draft = createDefaultDraft();
	draft.finder.goal = 'growth:agility';
	draft.finder.finalRace = 'any';
	draft.a.final.gender = 'female';
	const search = searchPaths(draft.a, draft.finder);
	assert.equal(search.status, 'ready');
	const candidate = search.matches[0].selection;
	assert.equal(draft.b, null);
	const applied = applyFinderCandidate(draft, candidate);
	assert.equal(applied.comparing, true);
	assert.deepEqual(applied.b, candidate);
	assert.equal(applied.b!.final.gender, 'female');
	assert.equal(applied.a, draft.a);
	assert.equal(applied.finder, draft.finder);
	assert.notEqual(applied.b, candidate);
	applied.b!.origin.race = ((candidate.origin.race + 1) % 4) as 0;
	assert.notDeepEqual(applied.b, candidate);

	const invalidSearch = { ...draft, finder: { ...draft.finder, requirements: [{ metric: 'effectAffinity' as const, value: 'NaN' }] } };
	assert.equal(applyFinderCandidate(invalidSearch, candidate), invalidSearch);
	const noMatches = { ...draft, finder: { ...draft.finder, requirements: [{ metric: 'effectAffinity' as const, value: '999' }] } };
	assert.equal(applyFinderCandidate(noMatches, candidate), noMatches);
	const changedGoal = { ...draft, finder: { ...draft.finder, goal: null } };
	assert.equal(applyFinderCandidate(changedGoal, candidate), changedGoal);
});

test('history fallback keeps in-memory pins and raw requirements without browser storage', () => {
	let draft = createDefaultDraft();
	draft = toggleLifePin(draft, 'origin');
	draft.finder.requirements = [{ metric: 'effectAffinity', value: 'bad' }];
	assert.deepEqual(initializePlanner(baseUrl, null, draft).draft, draft);
	assert.deepEqual(initializePlanner(`${baseUrl}?planner=invalid`, null, draft).draft, draft);
});
