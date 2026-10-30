/**
 * Local browser acceptance without touching the event service.
 * Start Vite first, then run with playwright-core installed or PLAYWRIGHT_MODULE
 * pointing at its index.mjs. BASE_URL and BROWSER_EXECUTABLE are optional.
 * All /api requests are mocked; screenshots go to the operating system temp folder.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath
	? modulePath.startsWith('file:') ? modulePath : pathToFileURL(resolve(modulePath)).href
	: 'playwright-core');
const baseUrl = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3107/');
const screenshots = await mkdtemp(join(tmpdir(), 'osmw-planner-browser-'));
const browser = await chromium.launch({
	headless: true,
	...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const errors = [];
const unexpectedApi = [];
const contexts = [];
let currentPage;
let completed = 0;

const unlocked = Object.fromEntries([0, 1, 2, 3].flatMap((origin) => [0, 1, 2, 3].map((first) => [
	`${origin}_${first}`,
	{ discovererName: `Explorer ${origin + 1}${first + 1}`, unlockedAt: 1787011200000 },
])));

async function newPage({ storageDisabled = false } = {}) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
	contexts.push(context);
	await context.route('**/api/**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname === '/api/combos' && request.method() === 'GET') {
			await route.fulfill({ json: { unlocked } });
		} else {
			unexpectedApi.push(`${request.method()} ${request.url()}`);
			await route.abort();
		}
	});
	await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
	await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
	await context.addInitScript(({ storageDisabled }) => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async () => { throw new DOMException('Clipboard disabled for test', 'NotAllowedError'); } },
		});
		if (storageDisabled) Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() { throw new DOMException('Storage disabled for test', 'SecurityError'); },
		});
	}, { storageDisabled });
	const page = await context.newPage();
	page.on('pageerror', (error) => errors.push(error.message));
	page.setDefaultTimeout(10_000);
	currentPage = page;
	return page;
}

async function check(name, action) {
	await action();
	completed++;
	console.log(`PASS ${name}`);
}

async function screenshot(page, name) {
	const file = join(screenshots, `${name}.png`);
	await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
	console.log(`Screenshot: ${file}`);
}

async function openPlanner(page) {
	await page.getByRole('button', { name: 'Trace a Path', exact: true }).click();
	await page.locator('#path-a').waitFor();
}

async function pathValues(page, id) {
	return page.locator(`#path-${id}`).evaluate((section) => ({
		races: [...section.querySelectorAll('select')].map((element) => element.value),
		genders: [...section.querySelectorAll('.gender-toggle button[aria-pressed="true"]')]
			.map((element) => element.getAttribute('aria-label').split(': ').at(-1)),
	}));
}

async function assertLayout(page, label) {
	const issues = await page.evaluate(() => {
		const issues = [];
		const width = window.innerWidth;
		if (document.documentElement.scrollWidth > width + 1) issues.push(`Page overflow: ${document.documentElement.scrollWidth}/${width}`);
		for (const element of document.querySelectorAll('.reborn-planner, .planner-path, .planner-result, .comparison-table, .growth-breakdown-table, .stage-field, .planner-life-summary')) {
			if (!element.getClientRects().length) continue;
			const box = element.getBoundingClientRect();
			if (box.left < -1 || box.right > width + 1) issues.push(`${element.className} exceeds viewport: ${box.left}..${box.right}/${width}`);
		}
		for (const cell of document.querySelectorAll('.comparison-table td, .comparison-table th, .growth-breakdown-table td, .growth-breakdown-table th')) {
			if (!cell.getClientRects().length) continue;
			if (cell.scrollWidth > cell.clientWidth + 1) issues.push(`Clipped table cell "${cell.textContent}": ${cell.scrollWidth}/${cell.clientWidth}`);
		}
		const context = document.createElement('canvas').getContext('2d');
		for (const select of document.querySelectorAll('.planner-stage select')) {
			const style = getComputedStyle(select);
			context.font = style.font;
			const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			const needed = context.measureText(select.selectedOptions[0].text).width;
			if (needed > available + 2) issues.push(`Clipped race selection "${select.selectedOptions[0].text}": needs ${needed}, has ${available}`);
		}
		for (const svg of document.querySelectorAll('.planner-result .stat-radar, .combo-tile.is-flipped .stat-radar')) {
			if (!svg.getClientRects().length) continue;
			const viewBox = svg.viewBox.baseVal;
			for (const text of svg.querySelectorAll('text')) {
				const box = text.getBBox();
				if (box.x < viewBox.x - 1 || box.x + box.width > viewBox.width + 1 || box.y < viewBox.y - 1 || box.y + box.height > viewBox.height + 1) {
					issues.push(`Clipped radar label "${text.textContent}"`);
				}
			}
			if (/NaN|Infinity/.test(svg.innerHTML)) issues.push('Non-finite chart geometry');
		}
		for (const face of document.querySelectorAll('.combo-tile.is-flipped .combo-face-back')) {
			const boundary = face.getBoundingClientRect();
			for (const element of face.querySelectorAll('.stat-radar-figure, .star-meter-reading, .star-meter-label, .back-index-note, .back-resists-title, .resist-list')) {
				const box = element.getBoundingClientRect();
				if (box.left < boundary.left - 1 || box.right > boundary.right + 1 || box.top < boundary.top - 1 || box.bottom > boundary.bottom + 1) {
					issues.push(`Wall content outside its card: ${element.className}`);
				}
			}
		}
		return issues;
	});
	assert.deepEqual(issues, [], label);
}

try {
	const page = await newPage();
	await page.goto(baseUrl.href);
	await page.locator('.combo-tile').first().waitFor();

	await check('Wall values toggle and exact accessible descriptions', async () => {
		assert.equal(await page.locator('.combo-tile').count(), 16);
		assert.equal(await page.getByRole('checkbox', { name: 'Show chart values' }).isChecked(), true);
		await page.locator('.combo-tile').first().click();
		assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
		assert.equal(await page.locator('.app').evaluate((element) => getComputedStyle(element).animationName), 'none');
		assert.equal(await page.locator('.combo-tile-inner').first().evaluate((element) => getComputedStyle(element).transitionDuration), '0s');
		const tile = page.locator('.combo-tile.is-flipped').first();
		assert.equal(await tile.locator('.radar-label-val').count(), 4);
		assert.equal(await tile.locator('.star-meter-value').count(), 2);
		assert.equal(await tile.locator('.stat-radar-title').textContent(), 'Rebirth bonus index');
		await page.getByRole('checkbox', { name: 'Show chart values' }).uncheck();
		assert.equal(await tile.locator('.radar-label-val').count(), 0);
		assert.equal(await tile.locator('.star-meter-value').count(), 0);
		assert.match(await tile.locator('.stat-radar').getAttribute('aria-label'), /STR: 1\.000/);
		assert.match(await tile.locator('.star-bar').first().getAttribute('aria-label'), /\+5 points/);
		await page.getByRole('checkbox', { name: 'Show chart values' }).check();
	});

	await check('Wall modal keyboard trap and opener restoration', async () => {
		const opener = page.getByRole('button', { name: 'View larger bonuses for Human → Human', exact: true });
		await opener.click();
		const dialog = page.getByRole('dialog');
		await dialog.waitFor();
		assert.equal(await dialog.evaluate((element) => getComputedStyle(element).animationName), 'none');
		assert.equal(await dialog.locator('.combo-modal-card').evaluate((element) => getComputedStyle(element).animationName), 'none');
		assert.equal(await dialog.locator('.radar-label-val').count(), 4);
		assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close bonuses');
		await page.keyboard.press('Shift+Tab');
		assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Show female bonuses');
		await page.keyboard.press('Tab');
		assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close bonuses');
		for (let index = 0; index < 6; index++) {
			await page.keyboard.press('Tab');
			assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
		}
		await page.keyboard.press('Escape');
		await dialog.waitFor({ state: 'detached' });
		assert.equal(await opener.evaluate((element) => element === document.activeElement), true);
	});

	await check('Independent paths, historical gender and actual rounded growth', async () => {
		await openPlanner(page);
		assert.equal(await page.locator('#path-b').count(), 0);
		await page.locator('#path-a-first').selectOption('3');
		await page.locator('#path-a-final').selectOption('2');
		await page.getByRole('button', { name: 'Path A second rebirth gender: female', exact: true }).click();
		assert.equal(await page.locator('#path-a .radar-label-val').first().textContent(), '0.986');
		await page.getByRole('button', { name: 'Compare another path', exact: true }).click();
		assert.deepEqual(await pathValues(page, 'b'), await pathValues(page, 'a'));
		await page.locator('#path-b-origin').selectOption('1');
		await page.getByRole('button', { name: 'Path B born gender: female', exact: true }).click();
		await page.getByRole('button', { name: 'Path B first rebirth gender: female', exact: true }).click();
		await page.locator('#path-b-final').selectOption('3');
		assert.deepEqual(await pathValues(page, 'a'), { races: ['0', '3', '2'], genders: ['male', 'male', 'female'] });
		assert.deepEqual(await pathValues(page, 'b'), { races: ['1', '3', '3'], genders: ['female', 'female', 'female'] });
		for (const element of await page.locator('.comparison-table .value-positive').all()) assert.match(await element.textContent(), /^\+/);
		assert.ok(await page.locator('.comparison-table .value-positive').count() > 0);
		assert.ok(await page.locator('.comparison-table .value-negative').count() > 0);
		for (const element of await page.locator('.comparison-table .value-negative').all()) assert.match(await element.textContent(), /^[−-]/);
	});

	await check('Comparison hide/reopen and numerical table with chart labels hidden', async () => {
		const previousB = await pathValues(page, 'b');
		await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
		assert.equal(await page.locator('#path-b').count(), 0);
		await page.getByRole('button', { name: 'Compare another path', exact: true }).click();
		assert.deepEqual(await pathValues(page, 'b'), previousB);
		await page.getByRole('checkbox', { name: 'Show chart values' }).uncheck();
		assert.equal(await page.locator('.planner-result .radar-label-val').count(), 0);
		assert.equal(await page.locator('.planner-result .star-meter-value').count(), 0);
		assert.match(await page.locator('#path-a .stat-radar').getAttribute('aria-label'), /0\.986/);
		assert.ok(await page.locator('.comparison-table td').count() > 0);
	});

	await check('Remember paths and preferences across views and reload', async () => {
		const previousA = await pathValues(page, 'a');
		const previousB = await pathValues(page, 'b');
		await page.getByRole('button', { name: 'The Wall', exact: true }).click();
		await page.locator('.combo-tile').first().click();
		assert.equal(await page.locator('.combo-tile.is-flipped .radar-label-val').count(), 0);
		await openPlanner(page);
		assert.deepEqual(await pathValues(page, 'a'), previousA);
		assert.deepEqual(await pathValues(page, 'b'), previousB);
		await page.reload();
		await page.locator('.combo-tile').first().waitFor();
		assert.equal(await page.getByRole('checkbox', { name: 'Show chart values' }).isChecked(), false);
		await openPlanner(page);
		assert.deepEqual(await pathValues(page, 'a'), previousA);
		assert.deepEqual(await pathValues(page, 'b'), previousB);
	});

	let comparisonUrl;
	await check('Canonical share links and selectable clipboard fallback', async () => {
		await page.getByRole('button', { name: 'Copy comparison link', exact: true }).click();
		const field = page.getByRole('textbox', { name: 'Link to share', exact: true });
		await field.waitFor();
		comparisonUrl = await field.inputValue();
		const url = new URL(comparisonUrl);
		assert.deepEqual([...url.searchParams.keys()].sort(), ['a', 'b', 'planner']);
		assert.equal(url.searchParams.get('a'), '0m-3m-2f');
		assert.equal(url.searchParams.get('b'), '1f-3f-3f');
		assert.equal(await field.evaluate((element) => element.selectionStart === 0 && element.selectionEnd === element.value.length), true);
		await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
		await page.getByRole('button', { name: 'Copy path link', exact: true }).click();
		await field.waitFor();
		assert.equal(new URL(await field.inputValue()).searchParams.has('b'), false);
		await page.getByRole('button', { name: 'Compare another path', exact: true }).click();
		assert.deepEqual(await pathValues(page, 'b'), { races: ['1', '3', '3'], genders: ['female', 'female', 'female'] });
		await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (value) => { window.__testCopiedLink = value; } },
		}));
		await page.getByRole('button', { name: 'Copy comparison link', exact: true }).click();
		await page.getByText('Comparison link copied.', { exact: true }).waitFor();
		assert.equal(await page.evaluate(() => window.__testCopiedLink), comparisonUrl);
	});

	await check('Edits dismiss late clipboard success and failure from an old path', async () => {
		for (const outcome of ['resolve', 'reject']) {
			await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: () => new Promise((resolve, reject) => {
					window.__testClipboardResolve = resolve;
					window.__testClipboardReject = reject;
				}) },
			}));
			await page.getByRole('button', { name: 'Copy comparison link', exact: true }).click();
			await page.getByRole('button', { name: 'Path A second rebirth gender: male', exact: true }).click();
			await page.evaluate(async (outcome) => {
				if (outcome === 'resolve') window.__testClipboardResolve();
				else window.__testClipboardReject(new Error('Late clipboard failure'));
				await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
			}, outcome);
			assert.equal(await page.locator('.planner-share-status').textContent(), '');
			assert.equal(await page.getByRole('textbox', { name: 'Link to share' }).count(), 0);
			await page.getByRole('button', { name: 'Path A second rebirth gender: female', exact: true }).click();
		}
	});

	await check('Copy A to B and differences-only empty/result states', async () => {
		await page.getByRole('button', { name: 'Copy A to B', exact: true }).click();
		assert.deepEqual(await pathValues(page, 'b'), await pathValues(page, 'a'));
		await page.getByRole('checkbox', { name: 'Show differences only' }).check();
		await page.locator('.comparison-empty').waitFor();
		assert.equal(await page.locator('.comparison-table').count(), 0);
		await page.locator('#path-b-final').selectOption('1');
		await page.locator('.comparison-table').waitFor();
		assert.equal(await page.locator('.comparison-table .value-unchanged').count(), 0);
		await page.getByRole('checkbox', { name: 'Show differences only' }).uncheck();
		await page.getByRole('checkbox', { name: 'Show chart values' }).check();
		await page.locator('#path-a summary').click();
		assert.equal(await page.locator('#path-a .growth-breakdown-table tbody tr').count(), 6);
		assert.equal(await page.locator('#path-a .planner-sources > li').count(), 5);
	});

	await check('Planner layout, chart labels, tables and expanded breakdown at five widths', async () => {
		for (const width of [320, 599, 960, 1024, 1440]) {
			await page.setViewportSize({ width, height: 1000 });
			await screenshot(page, `planner-${width}`);
			await assertLayout(page, `Planner layout at ${width}px`);
		}
	});

	await check('All flipped Wall cards keep chart values and scrollable resistances at 320/599px', async () => {
		await page.getByRole('button', { name: 'The Wall', exact: true }).click();
		for (const tile of await page.locator('.combo-tile').all()) {
			if (!(await tile.getAttribute('class')).includes('is-flipped')) await tile.click();
		}
		for (const width of [320, 599]) {
			await page.setViewportSize({ width, height: 1000 });
			await screenshot(page, `wall-${width}`);
			await assertLayout(page, `Wall layout at ${width}px`);
			for (const list of await page.locator('.combo-tile.is-flipped .resist-list').all()) {
				assert.ok(await list.evaluate((element) => element.clientHeight) >= 18, 'Wall keeps at least one resistance row visible and scrollable');
			}
		}
	});

	await check('Valid links override remembered paths and retain local chart preference', async () => {
		await page.getByRole('checkbox', { name: 'Show chart values' }).uncheck();
		await page.goto(comparisonUrl);
		await page.locator('#path-b').waitFor();
		assert.deepEqual(await pathValues(page, 'a'), { races: ['0', '3', '2'], genders: ['male', 'male', 'female'] });
		assert.deepEqual(await pathValues(page, 'b'), { races: ['1', '3', '3'], genders: ['female', 'female', 'female'] });
		assert.equal(await page.getByRole('checkbox', { name: 'Show chart values' }).isChecked(), false);
		await page.locator('#path-b-origin').selectOption('2');
		assert.equal(new URL(page.url()).searchParams.get('b'), '2f-3f-3f');
		await page.goto(new URL('?planner=1&a=invalid&b=0m-0m-0m', baseUrl).href);
		await page.locator('.planner-notice').waitFor();
		assert.deepEqual(await pathValues(page, 'a'), { races: ['0', '3', '2'], genders: ['male', 'male', 'female'] });
		assert.deepEqual(await pathValues(page, 'b'), { races: ['2', '3', '3'], genders: ['female', 'female', 'female'] });
	});

	await check('Unavailable storage leaves an editable planner and comparison', async () => {
		const isolated = await newPage({ storageDisabled: true });
		await isolated.goto(baseUrl.href);
		await openPlanner(isolated);
		await isolated.locator('#path-a-origin').selectOption('3');
		await isolated.getByRole('button', { name: 'Compare another path', exact: true }).click();
		await isolated.locator('#path-b-final').selectOption('1');
		await isolated.getByRole('button', { name: 'The Wall', exact: true }).click();
		await openPlanner(isolated);
		assert.equal(await isolated.locator('#path-a-origin').inputValue(), '3');
		assert.equal(await isolated.locator('#path-b-final').inputValue(), '1');
		await isolated.getByRole('button', { name: 'Copy comparison link', exact: true }).click();
		await isolated.getByRole('textbox', { name: 'Link to share' }).waitFor();
		await isolated.evaluate(() => {
			history.pushState(null, '', '/?planner=bad');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await isolated.locator('.planner-notice').waitFor();
		assert.equal(await isolated.locator('#path-a-origin').inputValue(), '3');
		assert.equal(await isolated.locator('#path-b-final').inputValue(), '1');
	});

	assert.deepEqual(errors, [], 'No uncaught browser errors');
	assert.deepEqual(unexpectedApi, [], 'No event writes or unexpected API calls');
	console.log(`Browser acceptance passed: ${completed} groups. Screenshots: ${screenshots}`);
} catch (error) {
	if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, 'failure').catch(() => undefined);
	console.error(error);
	process.exitCode = 1;
} finally {
	await Promise.all(contexts.map((context) => context.close()));
	await browser.close();
}
