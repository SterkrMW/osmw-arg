import { createHash } from 'node:crypto';
import plannerData from '../src/assets/reborn-planner.json' with { type: 'json' };
import { RACE_NAMES } from '../src/planner.js';
import type { PathSelection } from '../src/planner.js';
import { makePlannerUrl, parsePlannerUrl } from '../src/plannerLinks.js';
import type { SharedPlanner } from '../src/plannerLinks.js';

// Bump the layout version when the social-card presentation changes. Balance
// changes automatically get a new image URL without changing existing links.
export const OG_IMAGE_VERSION = createHash('sha256').update(`card-v1:${JSON.stringify(plannerData)}`).digest('hex').slice(0, 12);
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const SITE_TITLE = 'The Paths of Rebirth';

export interface ShareMetadata {
	shared: SharedPlanner;
	title: string;
	description: string;
	url: string;
	imageUrl: string;
	imageAlt: string;
}

export function pathDescription(path: PathSelection): string {
	return [path.origin, path.first, path.final]
		.map(life => `${RACE_NAMES[life.race]} ${life.gender}`).join(' → ');
}

export function buildShareMetadata(requestUrl: string, origin: string): ShareMetadata {
	const shared = parsePlannerUrl(new URL(requestUrl, origin).href);
	let title = `${SITE_TITLE} · osMW Online`;
	let description = 'Explore second-rebirth paths, compare growth rates and bonuses, and plan your character in osMW Online.';
	let url = new URL('/', origin).href;
	if (shared.status === 'valid') {
		title = `${shared.b ? 'Compare rebirth paths' : 'My rebirth path'} · ${SITE_TITLE}`;
		description = shared.b
			? `Path A: ${pathDescription(shared.a)}. Path B: ${pathDescription(shared.b)}. Compare resulting growth rates and inherited bonuses.`
			: `${pathDescription(shared.a)}. See resulting growth rates and inherited bonuses after both rebirths.`;
		url = makePlannerUrl(url, { a: shared.a, b: shared.b, comparing: shared.b !== null });
	}
	const imageUrl = new URL('/api/og', origin);
	imageUrl.search = new URL(url).search;
	imageUrl.searchParams.set('v', OG_IMAGE_VERSION);
	return { shared, title, description, url, imageUrl: imageUrl.href, imageAlt: description };
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Inject into the initial HTML response: crawlers need no JavaScript. */
export function injectShareMetadata(html: string, metadata: ShareMetadata): string {
	const meta = (attribute: 'name' | 'property', key: string, value: string): string =>
		`<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
	const tags = [
		`<title>${escapeHtml(metadata.title)}</title>`,
		meta('name', 'description', metadata.description),
		`<link rel="canonical" href="${escapeHtml(metadata.url)}" />`,
		meta('property', 'og:type', 'website'),
		meta('property', 'og:site_name', `${SITE_TITLE} · osMW Online`),
		meta('property', 'og:title', metadata.title),
		meta('property', 'og:description', metadata.description),
		meta('property', 'og:url', metadata.url),
		meta('property', 'og:image', metadata.imageUrl),
		meta('property', 'og:image:type', 'image/png'),
		meta('property', 'og:image:width', String(OG_WIDTH)),
		meta('property', 'og:image:height', String(OG_HEIGHT)),
		meta('property', 'og:image:alt', metadata.imageAlt),
		meta('name', 'twitter:card', 'summary_large_image'),
		meta('name', 'twitter:title', metadata.title),
		meta('name', 'twitter:description', metadata.description),
		meta('name', 'twitter:image', metadata.imageUrl),
		meta('name', 'twitter:image:alt', metadata.imageAlt),
	].join('\n\t\t');
	return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, '')
		.replace(/<meta\b[^>]*(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi, '')
		.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
		.replace(/<\/head>/i, () => `\t${tags}\n\t</head>`);
}

/** Deployment settings take precedence; forwarded headers are never trusted. */
export function publicOrigin(host: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
	const configured = env.PUBLIC_SITE_URL
		?? (env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : undefined)
		?? env.VERCEL_URL;
	if (configured) {
		const url = new URL(configured.includes('://') ? configured : `https://${configured}`);
		if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
			throw new Error('PUBLIC_SITE_URL must be an HTTPS origin without a path, query, or credentials.');
		}
		return url.origin;
	}
	if (!host || !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[::1\])(?::\d{1,5})?$/i.test(host)) {
		throw new Error('A valid site host is required.');
	}
	const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
	return new URL(`${local ? 'http' : 'https'}://${host}`).origin;
}
