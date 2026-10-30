import type { LifeSelection, PathSelection, Race } from './planner';
import { createDefaultFinderSettings, isMetricId, searchPaths } from './pathFinder';
import type { FinderSettings, LifeKey } from './pathFinder';

export interface PlannerDraft {
	version: 2;
	a: PathSelection;
	b: PathSelection | null;
	comparing: boolean;
	showChartValues: boolean;
	finder: FinderSettings;
}

export const PLANNER_STORAGE_KEY = 'osmw.reborn-planner.v2';
export const LEGACY_PLANNER_STORAGE_KEY = 'osmw.reborn-planner.v1';
type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function createDefaultDraft(): PlannerDraft {
	return {
		version: 2,
		a: {
			origin: { race: 0, gender: 'male' },
			first: { race: 0, gender: 'male' },
			final: { race: 0, gender: 'male' },
		},
		b: null,
		comparing: false,
		showChartValues: true,
		finder: createDefaultFinderSettings(),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLife(value: unknown): value is LifeSelection {
	return isRecord(value)
		&& typeof value.race === 'number'
		&& Number.isInteger(value.race)
		&& value.race >= 0 && value.race <= 3
		&& (value.gender === 'male' || value.gender === 'female');
}

export function isPathSelection(value: unknown): value is PathSelection {
	return isRecord(value) && isLife(value.origin) && isLife(value.first) && isLife(value.final);
}

export function clonePath(path: PathSelection): PathSelection {
	return {
		origin: { race: path.origin.race, gender: path.origin.gender },
		first: { race: path.first.race, gender: path.first.gender },
		final: { race: path.final.race, gender: path.final.gender },
	};
}

function parseFinder(value: unknown): FinderSettings | null {
	if (!isRecord(value) || typeof value.open !== 'boolean' || !isRecord(value.pins)
		|| typeof value.pins.origin !== 'boolean' || typeof value.pins.first !== 'boolean'
		|| typeof value.pins.final !== 'boolean'
		|| !(value.goal === null || isMetricId(value.goal))
		|| !Array.isArray(value.requirements)) return null;
	const finalRace = value.finalRace;
	if (finalRace !== 'same-as-a' && finalRace !== 'any'
		&& !(typeof finalRace === 'number' && Number.isInteger(finalRace) && finalRace >= 0 && finalRace <= 3)) return null;
	const requirements: FinderSettings['requirements'] = [];
	const metrics = new Set<string>();
	for (const requirement of value.requirements) {
		if (!isRecord(requirement) || !isMetricId(requirement.metric)
			|| typeof requirement.value !== 'string' || metrics.has(requirement.metric)) return null;
		metrics.add(requirement.metric);
		requirements.push({ metric: requirement.metric, value: requirement.value });
	}
	return {
		open: value.open,
		pins: { origin: value.pins.origin, first: value.pins.first, final: value.pins.final },
		finalRace: value.pins.final ? 'same-as-a' : finalRace as FinderSettings['finalRace'],
		goal: value.goal,
		requirements,
	};
}

export function parseStoredDraft(raw: string | null): PlannerDraft | null {
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !isPathSelection(value.a)
			|| !(value.b === null || isPathSelection(value.b))
			|| typeof value.comparing !== 'boolean' || typeof value.showChartValues !== 'boolean'
			|| (value.comparing && value.b === null)) return null;
		const finder = value.version === 1 ? createDefaultFinderSettings() : parseFinder(value.finder);
		if (!finder) return null;
		return {
			version: 2,
			a: clonePath(value.a),
			b: value.b === null ? null : clonePath(value.b),
			comparing: value.comparing,
			showChartValues: value.showChartValues,
			finder,
		};
	} catch {
		return null;
	}
}

export function loadPlannerDraft(storage: ReadStorage | null): PlannerDraft {
	try {
		return parseStoredDraft(storage?.getItem(PLANNER_STORAGE_KEY) ?? null)
			?? parseStoredDraft(storage?.getItem(LEGACY_PLANNER_STORAGE_KEY) ?? null)
			?? createDefaultDraft();
	} catch {
		return createDefaultDraft();
	}
}

export function savePlannerDraft(storage: WriteStorage | null, draft: PlannerDraft): void {
	try {
		storage?.setItem(PLANNER_STORAGE_KEY, JSON.stringify(draft));
	} catch {
		// Private browsing, disabled storage, or a full quota must not block planning.
	}
}

export function toggleComparison(draft: PlannerDraft): PlannerDraft {
	return {
		...draft,
		comparing: !draft.comparing,
		b: draft.b ?? clonePath(draft.a),
	};
}

export function copyAToB(draft: PlannerDraft): PlannerDraft {
	return { ...draft, b: clonePath(draft.a) };
}

/** Pins constrain edits to A without changing the independent comparison draft. */
export function updatePathA(draft: PlannerDraft, selection: PathSelection): PlannerDraft {
	if (!isPathSelection(selection)) return draft;
	const a = clonePath(selection);
	for (const key of ['origin', 'first', 'final'] as const) {
		if (draft.finder.pins[key]) a[key] = { ...draft.a[key] };
	}
	return { ...draft, a };
}

export function toggleLifePin(draft: PlannerDraft, life: LifeKey): PlannerDraft {
	const pins = { ...draft.finder.pins, [life]: !draft.finder.pins[life] };
	return {
		...draft,
		finder: { ...draft.finder, pins, finalRace: pins.final ? 'same-as-a' : draft.finder.finalRace },
	};
}

/** Only load a candidate still present in the current valid search. */
export function applyFinderCandidate(draft: PlannerDraft, selection: PathSelection): PlannerDraft {
	if (!isPathSelection(selection)) return draft;
	const search = searchPaths(draft.a, draft.finder);
	if (search.status !== 'ready' || !search.matches.some(({ selection: match }) =>
		(['origin', 'first', 'final'] as const).every((life) =>
			match[life].race === selection[life].race && match[life].gender === selection[life].gender))) return draft;
	return { ...draft, b: clonePath(selection), comparing: true };
}

function encodePath(path: PathSelection): string {
	return [path.origin, path.first, path.final]
		.map((life) => `${life.race}${life.gender === 'male' ? 'm' : 'f'}`).join('-');
}

function decodePath(encoded: string | null): PathSelection | null {
	if (encoded === null || !/^[0-3][mf]-[0-3][mf]-[0-3][mf]$/.test(encoded)) return null;
	const [origin, first, final] = encoded.split('-').map((part): LifeSelection => ({
		race: Number(part[0]) as Race,
		gender: part[1] === 'm' ? 'male' : 'female',
	}));
	return { origin, first, final };
}

export type SharedPlanner =
	| { status: 'none' }
	| { status: 'invalid' }
	| { status: 'valid'; a: PathSelection; b: PathSelection | null };

export function parsePlannerUrl(href: string): SharedPlanner {
	try {
		const params = new URL(href).searchParams;
		if (!params.has('planner')) return { status: 'none' };
		if (params.get('planner') !== '1' || params.getAll('planner').length !== 1
			|| params.getAll('a').length !== 1 || params.getAll('b').length > 1) {
			return { status: 'invalid' };
		}
		const a = decodePath(params.get('a'));
		const b = decodePath(params.get('b'));
		if (!a || (params.has('b') && !b)) return { status: 'invalid' };
		return { status: 'valid', a, b };
	} catch {
		return { status: 'invalid' };
	}
}

export function makePlannerUrl(baseUrl: string, draft: PlannerDraft): string {
	const url = new URL(baseUrl);
	url.hash = '';
	url.searchParams.set('planner', '1');
	url.searchParams.set('a', encodePath(draft.a));
	url.searchParams.delete('b');
	if (draft.comparing && draft.b) url.searchParams.set('b', encodePath(draft.b));
	return url.toString();
}

export function initializePlanner(href: string, storage: ReadStorage | null, currentDraft?: PlannerDraft): {
	draft: PlannerDraft;
	mode: 'wall' | 'builder';
	shared: boolean;
	notice: string | null;
} {
	const saved = currentDraft ?? loadPlannerDraft(storage);
	const link = parsePlannerUrl(href);
	if (link.status === 'valid') {
		return {
			draft: {
				...saved, a: link.a, b: link.b, comparing: link.b !== null,
				finder: createDefaultFinderSettings(),
			},
			mode: 'builder', shared: true, notice: null,
		};
	}
	return {
		draft: saved,
		mode: link.status === 'invalid' ? 'builder' : 'wall',
		shared: false,
		notice: link.status === 'invalid'
			? 'This shared path could not be opened. Your remembered path, or the starting path, is shown instead.'
			: null,
	};
}
