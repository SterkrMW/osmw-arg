import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { TestContext } from 'node:test';
import {
	buildShareMetadata, injectShareMetadata, OG_HEIGHT, OG_IMAGE_VERSION, OG_WIDTH, publicOrigin,
} from '../server/shareMetadata.ts';
import { serveOgImage, serveSharedPage, shareMiddleware } from '../server/shareHttp.ts';
import { parsePlannerUrl } from '../src/plannerLinks.ts';

const siteOrigin = 'https://rebirth.example.test';
const pathA = '0m-3m-2f';
const pathB = '3f-1m-0m';
const singleQuery = `?planner=1&a=${pathA}`;
const comparisonQuery = `${singleQuery}&b=${pathB}`;
const htmlTemplate = `<!doctype html><html lang="en"><head>
	<meta charset="UTF-8" />
	<title>Previous title</title>
	<meta name="description" content="Previous description" />
	<meta property="og:title" content="Old OG title" />
	<meta property="og:image" content="https://old.example/image.png" />
	<meta name="twitter:card" content="summary" />
	<link rel="canonical" href="https://old.example/" />
	<link rel="stylesheet" crossorigin href="/assets/index-example.css" />
	<script type="module" crossorigin src="/assets/index-example.js"></script>
</head><body><div id="root"></div></body></html>`;

function metaContent(html: string, property: string): string | undefined {
	const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return html.match(new RegExp(`<meta (?:name|property)="${escaped}" content="([^"]*)"`))?.[1]
		.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function useTestOrigin(t: TestContext): void {
	const previous = process.env.PUBLIC_SITE_URL;
	process.env.PUBLIC_SITE_URL = siteOrigin;
	t.after(() => {
		if (previous === undefined) delete process.env.PUBLIC_SITE_URL;
		else process.env.PUBLIC_SITE_URL = previous;
	});
}

interface HttpResult {
	status: number;
	headers: IncomingHttpHeaders;
	body: Buffer;
}

async function listen(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
	const server = createServer(handler);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	return (server.address() as AddressInfo).port;
}

async function read(port: number, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const req = request({ host: '127.0.0.1', port, path, method, headers, agent: false }, res => {
			const chunks: Buffer[] = [];
			res.on('data', chunk => chunks.push(Buffer.from(chunk)));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
			res.on('error', reject);
		});
		req.on('error', reject);
		req.end();
	});
}

function assertPng(response: HttpResult): void {
	assert.equal(response.status, 200, response.body.toString('utf8', 0, 100));
	assert.equal(response.headers['content-type'], 'image/png');
	assert.deepEqual(response.body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	assert.equal(response.body.toString('ascii', 12, 16), 'IHDR');
	assert.equal(response.body.readUInt32BE(16), OG_WIDTH);
	assert.equal(response.body.readUInt32BE(20), OG_HEIGHT);
	assert.equal(Number(response.headers['content-length']), response.body.length);
}

test('single-path metadata preserves every life and creates canonical versioned image URLs', () => {
	const metadata = buildShareMetadata(`/index.html?campaign=ignore&a=${pathA}&planner=1&finder=open#old`, siteOrigin);
	assert.deepEqual(metadata.shared, parsePlannerUrl(siteOrigin + singleQuery));
	assert.match(metadata.title, /^My rebirth path/);
	assert.match(metadata.description, /Human male.*Borg male.*Mage female/);
	assert.equal(metadata.url, siteOrigin + '/' + singleQuery);
	const image = new URL(metadata.imageUrl);
	assert.equal(image.origin, siteOrigin);
	assert.equal(image.pathname, '/api/og');
	assert.deepEqual([...image.searchParams.keys()], ['planner', 'a', 'v']);
	assert.equal(image.searchParams.get('a'), pathA);
	assert.equal(image.searchParams.get('v'), OG_IMAGE_VERSION);
	assert.equal(image.hash, '');
	assert.equal(metadata.imageAlt, metadata.description);
});

test('comparison metadata includes both selections in order and excludes local search settings', () => {
	const metadata = buildShareMetadata(`/api/share${comparisonQuery}&goal=effectAffinity&pins=all`, siteOrigin);
	assert.match(metadata.title, /^Compare rebirth paths/);
	assert.match(metadata.description, /Path A: Human male.*Borg male.*Mage female\. Path B: Borg female.*Centaur male.*Human male/);
	assert.equal(metadata.url, siteOrigin + '/' + comparisonQuery);
	assert.deepEqual(parsePlannerUrl(metadata.imageUrl), metadata.shared);
	assert.deepEqual([...new URL(metadata.imageUrl).searchParams.keys()], ['planner', 'a', 'b', 'v']);
	const reversed = buildShareMetadata(`/?planner=1&a=${pathB}&b=${pathA}`, siteOrigin);
	assert.notEqual(reversed.imageUrl, metadata.imageUrl);
	assert.notEqual(reversed.description, metadata.description);
});

test('malformed and duplicate parameters receive a generic preview without a partially valid path', () => {
	const generic = buildShareMetadata('/', siteOrigin);
	const invalid = [
		'?planner=1', '?planner=2&a=0m-0m-0m', '?planner=1&a=0m-0m-4m',
		'?planner=1&a=0m-0m-0x', `${singleQuery}&b=`, `${singleQuery}&b=bad`,
		`${singleQuery}&a=1m-1m-1m`, `${singleQuery}&planner=1`,
		`${comparisonQuery}&b=1m-1m-1m`, '?planner=1&a=%3Cscript%3E',
	];
	for (const query of invalid) {
		const metadata = buildShareMetadata('/' + query, siteOrigin);
		assert.equal(metadata.shared.status, 'invalid', query);
		assert.equal(metadata.title, generic.title);
		assert.equal(metadata.description, generic.description);
		assert.equal(metadata.url, siteOrigin + '/');
		assert.equal(metadata.imageUrl, generic.imageUrl);
		assert.deepEqual([...new URL(metadata.imageUrl).searchParams.keys()], ['v']);
	}
	assert.equal(buildShareMetadata('/?a=0m-0m-0m&b=3f-3f-3f', siteOrigin).shared.status, 'none');
});

test('initial HTML replaces old metadata, escapes literal content, and preserves the application assets', () => {
	const metadata = buildShareMetadata('/' + comparisonQuery, siteOrigin);
	const injected = injectShareMetadata(htmlTemplate, metadata);
	assert.equal(metaContent(injected, 'og:title'), metadata.title);
	assert.equal(metaContent(injected, 'og:image'), metadata.imageUrl);
	assert.equal(metaContent(injected, 'og:url'), metadata.url);
	assert.equal(metaContent(injected, 'og:image:type'), 'image/png');
	assert.equal(metaContent(injected, 'og:image:width'), '1200');
	assert.equal(metaContent(injected, 'og:image:height'), '630');
	assert.equal(metaContent(injected, 'og:image:alt'), metadata.description);
	assert.equal(metaContent(injected, 'twitter:card'), 'summary_large_image');
	assert.equal(metaContent(injected, 'twitter:image'), metadata.imageUrl);
	assert.equal((injected.match(/property="og:image"/g) ?? []).length, 1);
	assert.equal((injected.match(/name="description"/g) ?? []).length, 1);
	assert.equal((injected.match(/rel="canonical"/g) ?? []).length, 1);
	assert.equal((injected.match(/<title>/g) ?? []).length, 1);
	assert.ok(!injected.includes('old.example'));
	assert.ok(!injected.includes('Previous title'));
	assert.ok(injected.includes('<meta charset="UTF-8" />'));
	assert.ok(injected.includes('<link rel="stylesheet" crossorigin href="/assets/index-example.css" />'));
	assert.ok(injected.includes('<script type="module" crossorigin src="/assets/index-example.js"></script>'));
	assert.ok(injected.includes('<div id="root"></div>'));

	const literal = `<script>alert("x")</script> & ' $& $' $\``;
	const escaped = injectShareMetadata(htmlTemplate, { ...metadata, title: literal, description: literal, imageAlt: literal });
	assert.equal(metaContent(escaped, 'og:title'), literal);
	assert.equal(metaContent(escaped, 'description'), literal);
	assert.equal(metaContent(escaped, 'og:image:alt'), literal);
	assert.ok(escaped.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39; $&amp; $&#39; $`'));
	assert.ok(!escaped.includes('<script>alert'));
	assert.equal((escaped.match(/<\/head>/g) ?? []).length, 1);
});

test('public origins prefer trusted deployment settings and reject invalid origin shapes', () => {
	assert.equal(publicOrigin('evil.invalid', { PUBLIC_SITE_URL: siteOrigin, VERCEL_URL: 'preview.vercel.app' }), siteOrigin);
	assert.equal(publicOrigin('evil.invalid', { PUBLIC_SITE_URL: 'rebirth.example.test' }), siteOrigin);
	assert.equal(publicOrigin('evil.invalid', { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'game.example.test', VERCEL_URL: 'preview.vercel.app' }), 'https://game.example.test');
	assert.equal(publicOrigin('evil.invalid', { VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'game.example.test', VERCEL_URL: 'preview.vercel.app' }), 'https://preview.vercel.app');
	assert.equal(publicOrigin('127.0.0.1:3107', {}), 'http://127.0.0.1:3107');
	assert.equal(publicOrigin('[::1]:3107', {}), 'http://[::1]:3107');
	assert.equal(publicOrigin('localhost:3000', {}), 'http://localhost:3000');
	assert.equal(publicOrigin('game.example.test', {}), 'https://game.example.test');
	for (const origin of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/subpath', 'https://example.test/?x=1', 'https://example.test/#fragment']) {
		assert.throws(() => publicOrigin('safe.example.test', { PUBLIC_SITE_URL: origin }));
	}
	for (const host of [undefined, 'good.test/evil', 'bad@host.test', 'bad.test\r\nX-Foo: evil', 'bad.test:99999']) {
		assert.throws(() => publicOrigin(host, {}));
	}
	const absoluteRequest = buildShareMetadata('https://untrusted.invalid/' + comparisonQuery, siteOrigin);
	assert.equal(new URL(absoluteRequest.url).origin, siteOrigin);
	assert.equal(new URL(absoluteRequest.imageUrl).origin, siteOrigin);
});

test('real HTTP HTML responses expose comparison metadata to crawlers before JavaScript and ignore forwarded hosts', async t => {
	useTestOrigin(t);
	const port = await listen(t, (req, res) => { void serveSharedPage(req, res, async () => htmlTemplate); });
	const response = await read(port, '/' + comparisonQuery, 'GET', {
		host: 'untrusted.invalid', 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'http',
		forwarded: 'host=attacker.invalid;proto=http', 'user-agent': 'Discordbot',
	});
	assert.equal(response.status, 200);
	assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
	assert.equal(response.headers['x-content-type-options'], 'nosniff');
	assert.match(String(response.headers['cache-control']), /s-maxage=300/);
	assert.equal(Number(response.headers['content-length']), response.body.length);
	const html = response.body.toString('utf8');
	const imageUrl = metaContent(html, 'og:image');
	assert.ok(imageUrl);
	assert.equal(new URL(imageUrl).origin, siteOrigin);
	assert.deepEqual(parsePlannerUrl(imageUrl), parsePlannerUrl(siteOrigin + '/' + comparisonQuery));
	assert.ok(html.includes('/assets/index-example.js'));
	assert.ok(!html.includes('attacker.invalid'));
	assert.ok(!html.includes('untrusted.invalid'));
	const ordinaryBrowser = await read(port, '/' + comparisonQuery, 'GET', { 'user-agent': 'Mozilla/5.0' });
	assert.deepEqual(ordinaryBrowser.body, response.body);
	const head = await read(port, '/' + comparisonQuery, 'HEAD');
	assert.equal(head.status, 200);
	assert.equal(head.body.length, 0);
	assert.equal(head.headers['content-length'], response.headers['content-length']);
	assert.equal(head.headers['content-type'], response.headers['content-type']);
	const post = await read(port, '/' + comparisonQuery, 'POST');
	assert.equal(post.status, 405);
	assert.equal(post.headers.allow, 'GET, HEAD');
	assert.equal(post.headers['cache-control'], 'no-store');
	assert.equal(post.headers['x-content-type-options'], 'nosniff');
});

test('middleware intercepts only share pages and leaves ordinary app, assets, and discovery requests alone', async t => {
	useTestOrigin(t);
	const loaded: string[] = [];
	const middleware = shareMiddleware(async url => { loaded.push(url); return htmlTemplate; });
	const port = await listen(t, (req, res) => middleware(req, res, () => { res.statusCode = 204; res.end(); }));
	for (const path of ['/', '/?campaign=summer', '/index.html', '/assets/app.js', '/api/combos', '/other?planner=1']) {
		assert.equal((await read(port, path)).status, 204, path);
	}
	assert.deepEqual(loaded, []);
	for (const path of ['/' + singleQuery, '/index.html' + comparisonQuery, '/api/share' + comparisonQuery]) {
		const response = await read(port, path);
		assert.equal(response.status, 200, path);
		assert.deepEqual(parsePlannerUrl(metaContent(response.body.toString(), 'og:url')!), parsePlannerUrl(siteOrigin + path));
	}
	assert.equal(loaded.length, 3);
	const malformed = await read(port, `/${singleQuery}&b=bad`);
	assert.equal(malformed.status, 200);
	assert.equal(metaContent(malformed.body.toString(), 'og:url'), siteOrigin + '/');
	assert.ok(malformed.body.includes(Buffer.from('<div id="root"></div>')));
});

test('HTML loader failures return a non-cacheable generic error without leaking details', async t => {
	useTestOrigin(t);
	t.mock.method(console, 'error', () => undefined);
	const port = await listen(t, (req, res) => {
		void serveSharedPage(req, res, async () => { throw new Error('private-build-path-and-secret'); });
	});
	const response = await read(port, '/' + singleQuery);
	assert.equal(response.status, 500);
	assert.equal(response.headers['cache-control'], 'no-store');
	assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
	assert.equal(response.headers['x-content-type-options'], 'nosniff');
	assert.match(response.body.toString(), /temporarily unavailable/);
	assert.ok(!response.body.includes(Buffer.from('private-build-path-and-secret')));
});

test('real PNG responses are 1200 by 630, vary by A and B, and share a safe generic fallback', async t => {
	const port = await listen(t, (req, res) => { void serveOgImage(req, res); });
	const generic = await read(port, '/api/og');
	const malformed = await read(port, `/api/og${comparisonQuery}&b=bad`);
	const single = await read(port, '/api/og' + singleQuery);
	const comparison = await read(port, '/api/og' + comparisonQuery);
	const changedA = await read(port, `/api/og?planner=1&a=2f-2m-2f&b=${pathB}`);
	const changedB = await read(port, `/api/og${singleQuery}&b=0m-0m-0m`);
	for (const response of [generic, malformed, single, comparison, changedA, changedB]) {
		assertPng(response);
		assert.equal(response.headers['x-content-type-options'], 'nosniff');
		assert.match(String(response.headers['cache-control']), /s-maxage=86400/);
	}
	assert.deepEqual(malformed.body, generic.body);
	assert.notDeepEqual(single.body, generic.body);
	assert.notDeepEqual(single.body, comparison.body);
	assert.notDeepEqual(changedA.body, comparison.body);
	assert.notDeepEqual(changedB.body, comparison.body);
	const head = await read(port, '/api/og' + comparisonQuery, 'HEAD');
	assert.equal(head.status, 200);
	assert.equal(head.body.length, 0);
	assert.equal(head.headers['content-length'], comparison.headers['content-length']);
	assert.equal(head.headers['content-type'], 'image/png');
	const post = await read(port, '/api/og' + comparisonQuery, 'POST');
	assert.equal(post.status, 405);
	assert.equal(post.headers.allow, 'GET, HEAD');
	assert.equal(post.headers['cache-control'], 'no-store');
});
