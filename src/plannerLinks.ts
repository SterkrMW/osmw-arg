import type { LifeSelection, PathSelection, Race } from './planner.js';

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

export function makePlannerUrl(baseUrl: string, draft: {
	a: PathSelection;
	b: PathSelection | null;
	comparing: boolean;
}): string {
	const url = new URL(baseUrl);
	url.hash = '';
	url.searchParams.set('planner', '1');
	url.searchParams.set('a', encodePath(draft.a));
	url.searchParams.delete('b');
	if (draft.comparing && draft.b) url.searchParams.set('b', encodePath(draft.b));
	return url.toString();
}
