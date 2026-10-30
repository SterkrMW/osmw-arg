import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildShareMetadata, injectShareMetadata, publicOrigin } from './shareMetadata.js';

export type HtmlLoader = (url: string) => Promise<string>;
export const loadBuiltHtml: HtmlLoader = () => readFile(resolve(process.cwd(), 'dist/index.html'), 'utf8');

function acceptRead(req: IncomingMessage, res: ServerResponse): boolean {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	if (req.method === 'GET' || req.method === 'HEAD') return true;
	res.statusCode = 405;
	res.setHeader('Allow', 'GET, HEAD');
	res.setHeader('Cache-Control', 'no-store');
	res.end('Method not allowed');
	return false;
}

function fail(res: ServerResponse, error: unknown): void {
	console.error('[share-preview]', error instanceof Error ? error.message : 'Preview failed');
	res.statusCode = 500;
	res.setHeader('Content-Type', 'text/plain; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end('The sharing preview is temporarily unavailable.');
}

export async function serveSharedPage(req: IncomingMessage, res: ServerResponse, loadHtml: HtmlLoader = loadBuiltHtml): Promise<void> {
	if (!acceptRead(req, res)) return;
	try {
		const metadata = buildShareMetadata(req.url ?? '/', publicOrigin(req.headers.host));
		const html = injectShareMetadata(await loadHtml(req.url ?? '/'), metadata);
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
		res.setHeader('Content-Length', Buffer.byteLength(html));
		res.end(req.method === 'HEAD' ? undefined : html);
	} catch (error) {
		fail(res, error);
	}
}

export async function serveOgImage(req: IncomingMessage, res: ServerResponse): Promise<void> {
	if (!acceptRead(req, res)) return;
	try {
		// No caller-supplied image URLs, fonts, or text enter the renderer.
		const metadata = buildShareMetadata(req.url ?? '/', 'https://preview.invalid');
		const { renderOgImage } = await import('./ogCard.js');
		const png = await renderOgImage(metadata.shared);
		res.statusCode = 200;
		res.setHeader('Content-Type', 'image/png');
		res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
		res.setHeader('Content-Length', png.byteLength);
		res.end(req.method === 'HEAD' ? undefined : png);
	} catch (error) {
		fail(res, error);
	}
}

/** Vite development/preview mirrors the production query-conditioned route. */
export function shareMiddleware(loadHtml: HtmlLoader) {
	return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (url.pathname === '/api/og') { void serveOgImage(req, res); return; }
		if (url.pathname === '/api/share'
			|| ((url.pathname === '/' || url.pathname === '/index.html') && url.searchParams.has('planner'))) {
			void serveSharedPage(req, res, loadHtml);
			return;
		}
		next();
	};
}
