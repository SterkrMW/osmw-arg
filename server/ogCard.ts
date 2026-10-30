import { ImageResponse } from '@vercel/og';
import { createElement as h } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { calculatePath, GROWTH_DECIMALS, GROWTH_LABELS, RACE_NAMES } from '../src/planner.js';
import type { PathResult, PathSelection } from '../src/planner.js';
import type { SharedPlanner } from '../src/plannerLinks.js';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// These fixed colours mirror the site's parchment, wood, and race accents.
// Only bundled text and vector shapes are rendered: no remote image/font fetches.
const palette = {
	wood: '#2e1b0d',
	woodLight: '#5a381b',
	parchment: '#f5ead3',
	cream: '#fff8e8',
	ink: '#44301f',
	muted: '#795d42',
	line: '#d7bc93',
	gold: '#deb662',
};
const raceColours = ['#c99331', '#638541', '#5263a0', '#965077'];
const statKeys = ['strength', 'intelligence', 'agility', 'stamina'] as const;
const lives = [
	{ key: 'origin', label: 'BORN' },
	{ key: 'first', label: 'FIRST REBIRTH' },
	{ key: 'final', label: 'SECOND REBIRTH' },
] as const;

function box(style: CSSProperties, ...children: ReactNode[]): ReactElement {
	return h('div', { style: { display: 'flex', ...style } }, ...children);
}

function text(value: string, style: CSSProperties = {}): ReactElement {
	return box(style, value);
}

function route(selection: PathSelection, large = false): ReactElement {
	return box({ gap: large ? 12 : 8, width: '100%' }, ...lives.map(({ key, label }) =>
		box({
			flexDirection: 'column', flexGrow: 1, flexBasis: 0,
			borderTop: `4px solid ${raceColours[selection[key].race]}`,
			paddingTop: 10,
		},
			text(label, { color: palette.muted, fontSize: large ? 14 : 12, letterSpacing: 1 }),
			text(RACE_NAMES[selection[key].race], { fontSize: large ? 28 : 24, marginTop: 6 }),
			text(selection[key].gender, { color: palette.muted, fontSize: 18 }),
		),
	));
}

function growth(result: PathResult, large = false): ReactElement {
	return box({ flexDirection: 'column', width: '100%' },
		text('RESULTING GROWTH RATES', {
			fontSize: large ? 17 : 15, color: palette.muted, letterSpacing: 1,
			marginBottom: 7,
		}),
		...statKeys.map((key) => box({
			justifyContent: 'space-between', alignItems: 'center',
			height: large ? 47 : 36,
		},
			text(GROWTH_LABELS[key], { fontSize: large ? 24 : 20 }),
			text(result.growthRates[key].toFixed(GROWTH_DECIMALS), { fontSize: large ? 32 : 27 }),
		)),
	);
}

function bonuses(result: PathResult, large = false): ReactElement {
	return box({
		justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${palette.line}`,
		paddingTop: 13, marginTop: 11,
	},
		box({ flexDirection: 'column' },
			text('Effect affinity', { fontSize: large ? 19 : 16, color: palette.muted }),
			text(`${result.effectAffinity} points`, { fontSize: large ? 28 : 23 }),
		),
		box({ flexDirection: 'column', alignItems: 'flex-end' },
			text('Skill damage bonus', { fontSize: large ? 19 : 16, color: palette.muted }),
			text(`${result.damageBonusPercent}%`, { fontSize: large ? 28 : 23 }),
		),
	);
}

function pathPanel(label: string, selection: PathSelection): ReactElement {
	const result = calculatePath(selection);
	return box({
		flexDirection: 'column', flexGrow: 1, flexBasis: 0, padding: '18px 24px',
		background: palette.parchment, color: palette.ink, borderRadius: 12,
	},
		text(label, { fontSize: 26, marginBottom: 12 }),
		route(selection),
		box({ marginTop: 17 }, growth(result)),
		bonuses(result),
	);
}

function singlePanel(selection: PathSelection): ReactElement {
	const result = calculatePath(selection);
	return box({
		width: '100%', padding: '28px 32px', gap: 42,
		background: palette.parchment, color: palette.ink, borderRadius: 12,
	},
		box({ flexDirection: 'column', width: 490, justifyContent: 'space-between' },
			box({ flexDirection: 'column' },
				text('Your three lives', { fontSize: 30, marginBottom: 24 }),
				route(selection, true),
			),
			box({
				flexDirection: 'column', padding: '20px 22px',
				background: '#ead9bb', borderRadius: 8,
			},
				text('Trace a Path', { fontSize: 26, marginBottom: 6 }),
				text('Explore inherited bonuses and compare the paths ahead.', {
					fontSize: 20, color: palette.muted, lineHeight: 1.5,
				}),
			),
		),
		box({ flexDirection: 'column', flexGrow: 1, flexBasis: 0 },
			growth(result, true),
			bonuses(result, true),
		),
	);
}

function genericPanel(): ReactElement {
	return box({
		flexDirection: 'column', justifyContent: 'center', width: '100%',
		padding: '36px 42px', background: palette.parchment, color: palette.ink, borderRadius: 12,
	},
		text('Three lives. Your path.', { fontSize: 48, marginBottom: 12 }),
		text('Plan your rebirths, compare growth and discover your next character.', {
			fontSize: 27, color: palette.muted, maxWidth: 940, lineHeight: 1.5,
		}),
		box({ gap: 18, marginTop: 34 }, ...RACE_NAMES.map((name, race) =>
			box({
				flexGrow: 1, flexBasis: 0, flexDirection: 'column', padding: '16px 20px',
				borderTop: `5px solid ${raceColours[race]}`, background: palette.cream,
			}, text(name, { fontSize: 28 })),
		)),
	);
}

/** React presentation stays server-only; the browser bundle does not include the renderer. */
export function createOgCard(shared: SharedPlanner): ReactElement {
	const valid = shared.status === 'valid';
	const comparing = valid && shared.b !== null;
	return box({
		width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, flexDirection: 'column',
		padding: '26px 32px 22px', background: palette.wood,
		backgroundImage: `linear-gradient(120deg, ${palette.woodLight}, ${palette.wood})`,
		fontFamily: 'sans-serif', color: palette.cream,
	},
		box({ justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
			text('osMW ONLINE', { fontSize: 18, letterSpacing: 3, color: palette.gold }),
			text(comparing ? 'REBIRTH COMPARISON' : valid ? 'SHARED REBIRTH PATH' : 'CHARACTER GROWTH PLANNER', {
				fontSize: 16, letterSpacing: 2, color: palette.gold,
			}),
		),
		text('The Paths of Rebirth', { fontSize: 42, lineHeight: 1.2, marginBottom: 20 }),
		box({ flexGrow: 1, flexBasis: 0, gap: 20 },
			...(valid
				? comparing
					? [pathPanel('Path A', shared.a), pathPanel('Path B', shared.b!)]
					: [singlePanel(shared.a)]
				: [genericPanel()]),
		),
		box({ justifyContent: 'space-between', marginTop: 16, fontSize: 16, color: '#e4ceb0' },
			text(valid ? 'Growth coefficients after two rebirths' : 'The Wall  /  Trace a Path  /  Find paths'),
			text(comparing ? 'Open to compare every bonus' : valid ? 'Open to explore this path' : 'Discover the paths ahead'),
		),
	);
}

/** The built-in font and WASM rasterizer work without a browser or external assets. */
export async function renderOgImage(shared: SharedPlanner): Promise<Buffer> {
	const response = new ImageResponse(createOgCard(shared), {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
	});
	return Buffer.from(await response.arrayBuffer());
}
