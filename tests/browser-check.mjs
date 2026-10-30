/**
 * Local browser acceptance without touching the event service.
 * Start Vite first, then run with playwright-core installed or PLAYWRIGHT_MODULE
 * pointing at its index.mjs. BASE_URL and BROWSER_EXECUTABLE are optional.
 * All /api requests are mocked; screenshots go to the operating system temp folder.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath
	? modulePath.startsWith('file:') ? modulePath : pathToFileURL(resolve(modulePath)).href
	: 'playwright-core');
const baseUrl = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3107/');
const plannerData = JSON.parse(await readFile(new URL('../src/assets/reborn-planner.json', import.meta.url), 'utf8'));
const expectedBonusKeys = [...new Set([
	...Object.values(plannerData.tier1), ...Object.values(plannerData.tier2), ...Object.values(plannerData.secretCombos),
].flatMap((preset) => [...Object.keys(preset.resistanceBonuses), ...Object.keys(preset.sameRace?.resistanceBonuses ?? {})]))].sort();
const expectedMetricIds = [
	'growth:strength', 'growth:intelligence', 'growth:agility', 'growth:stamina',
	'effectAffinity', 'damageBonusPercent', ...expectedBonusKeys.map((key) => `resistance:${key}`),
].sort();
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

async function openFinder(page) {
	const toggle = page.getByRole('button', { name: 'Find paths', exact: true });
	if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
	await page.getByRole('combobox', { name: 'Main goal', exact: true }).waitFor();
}

async function assertFinderCount(page, shown, total) {
	await page.locator('.finder-results-count').filter({ hasText: `Showing ${shown} of ${total} matching paths` }).waitFor();
	assert.equal(await page.locator('.finder-result').count(), shown);
}

async function assertAlignedEditors(page) {
	const [a, b] = await page.evaluate(() => ['a', 'b'].map((id) => {
		const path = document.getElementById(`path-${id}`);
		return {
			height: path.querySelector('.planner-editor').getBoundingClientRect().height,
			resultTop: path.querySelector('.planner-result').getBoundingClientRect().top,
			widths: [...path.querySelectorAll('.stage-select')].map((select) => select.getBoundingClientRect().width),
		};
	}));
	assert.ok(Math.abs(a.height - b.height) <= 1, 'Default A/B editor heights align');
	assert.ok(Math.abs(a.resultTop - b.resultTop) <= 1, 'Default A/B results start at the same height');
	for (let index = 0; index < a.widths.length; index++) {
		assert.ok(Math.abs(a.widths[index] - b.widths[index]) <= 1, 'Default A/B race selectors have equal width');
	}
}

async function unpinAll(page) {
	while (await page.getByRole('button', { name: /^Unpin Path A / }).count()) {
		await page.getByRole('button', { name: /^Unpin Path A / }).first().click();
	}
}

async function removeAllRequirements(page) {
	while (await page.getByRole('button', { name: /^Remove minimum / }).count()) {
		await page.getByRole('button', { name: /^Remove minimum / }).first().click();
	}
}

async function assertTouchTargets(page, label) {
	const smallTargets = await page.evaluate(() => [...document.querySelectorAll(
		'.life-pin, .finder-toggle, .finder-add, .finder-remove, .finder-more, .finder-use, .path-finder select, .path-finder input',
	)].filter((element) => element.getClientRects().length && !element.disabled)
		.map((element) => ({ name: element.getAttribute('aria-label') ?? element.textContent.trim(), height: element.getBoundingClientRect().height }))
		.filter((target) => target.height < 44));
	assert.deepEqual(smallTargets, [], label);
}

async function assertLayout(page, label) {
	const issues = await page.evaluate(() => {
		const issues = [];
		const width = window.innerWidth;
		if (document.documentElement.scrollWidth > width + 1) issues.push(`Page overflow: ${document.documentElement.scrollWidth}/${width}`);
		for (const element of document.querySelectorAll('.reborn-planner, .planner-path, .planner-result, .comparison-table, .growth-breakdown-table, .stage-field, .planner-life-summary, .path-finder, [class^="finder-"]')) {
			if (!element.getClientRects().length) continue;
			const box = element.getBoundingClientRect();
			if (box.left < -1 || box.right > width + 1) issues.push(`${element.className} exceeds viewport: ${box.left}..${box.right}/${width}`);
		}
		for (const cell of document.querySelectorAll('.comparison-table td, .comparison-table th, .growth-breakdown-table td, .growth-breakdown-table th')) {
			if (!cell.getClientRects().length) continue;
			if (cell.scrollWidth > cell.clientWidth + 1) issues.push(`Clipped table cell "${cell.textContent}": ${cell.scrollWidth}/${cell.clientWidth}`);
		}
		const context = document.createElement('canvas').getContext('2d');
		for (const select of document.querySelectorAll('.planner-stage select, .path-finder select, [class^="finder-"] select')) {
			if (!select.getClientRects().length) continue;
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
		assert.equal(await page.locator('.life-pin, .planner-pin-help').count(), 0, 'Pin controls and help start hidden');
		await page.locator('#path-a-first').selectOption('3');
		await page.locator('#path-a-final').selectOption('2');
		await page.getByRole('button', { name: 'Path A second rebirth gender: female', exact: true }).click();
		assert.equal(await page.locator('#path-a .radar-label-val').first().textContent(), '0.986');
		await page.getByRole('button', { name: 'Compare another path', exact: true }).click();
		assert.deepEqual(await pathValues(page, 'b'), await pathValues(page, 'a'));
		await assertAlignedEditors(page);
		await screenshot(page, 'comparison-default-1440');
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
			if (width >= 960) await assertAlignedEditors(page);
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

	const finderPage = await newPage();
	await finderPage.goto(baseUrl.href);
	await openPlanner(finderPage);
	await finderPage.getByRole('button', { name: 'Path A second rebirth gender: female', exact: true }).click();
	await finderPage.getByRole('button', { name: 'Compare another path', exact: true }).click();
	await finderPage.locator('#path-b-first').selectOption('2');
	await finderPage.getByRole('button', { name: 'Path B born gender: female', exact: true }).click();
	await finderPage.getByRole('button', { name: 'Path B second rebirth gender: male', exact: true }).click();
	const untouchedB = await pathValues(finderPage, 'b');

	await check('Finder requires a goal, offers every metric, and paginates without changing Path B', async () => {
		assert.equal(await finderPage.locator('.life-pin, .planner-pin-help').count(), 0);
		await finderPage.getByRole('button', { name: 'Find paths', exact: true }).focus();
		await finderPage.keyboard.press('Enter');
		assert.equal(await finderPage.locator('.life-pin').count(), 3);
		assert.equal(await finderPage.locator('.planner-pin-help').isVisible(), true);
		const goal = finderPage.getByRole('combobox', { name: 'Main goal', exact: true });
		const finalRace = finderPage.getByRole('combobox', { name: 'Final race', exact: true });
		await finderPage.keyboard.press('Tab');
		assert.equal(await goal.evaluate((element) => element === document.activeElement), true);
		assert.equal(await goal.inputValue(), '');
		assert.equal(await finalRace.inputValue(), 'same-as-a');
		assert.equal(await finderPage.locator('.finder-result').count(), 0);
		await finderPage.locator('.finder-empty').filter({ hasText: 'Choose a main goal' }).waitFor();
		const metrics = await goal.locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
		assert.deepEqual(metrics.sort(), expectedMetricIds);
		assert.equal(new Set(metrics).size, metrics.length);
		await goal.selectOption('growth:strength');
		await assertFinderCount(finderPage, 10, 64);
		const firstPage = await finderPage.locator('.finder-result-route').allTextContents();
		assert.ok(firstPage.every((route) => route.endsWith('Human female')));
		await finderPage.getByRole('button', { name: 'Show more paths', exact: true }).click();
		await assertFinderCount(finderPage, 20, 64);
		assert.deepEqual((await finderPage.locator('.finder-result-route').allTextContents()).slice(0, 10), firstPage);
		await finalRace.selectOption('any');
		await assertFinderCount(finderPage, 10, 256);
		assert.ok((await finderPage.locator('.finder-result-route').allTextContents()).some((route) => !route.endsWith('Human female')));
		await finderPage.getByRole('button', { name: 'Show more paths', exact: true }).click();
		await assertFinderCount(finderPage, 20, 256);
		await goal.selectOption('effectAffinity');
		await assertFinderCount(finderPage, 10, 256);
		assert.deepEqual(await pathValues(finderPage, 'b'), untouchedB);
		await finderPage.getByRole('button', { name: 'Find paths', exact: true }).click();
		assert.equal(await finderPage.locator('.life-pin, .planner-pin-help').count(), 0, 'Closing the unpinned finder restores clean comparison');
		await assertAlignedEditors(finderPage);
		await openFinder(finderPage);
	});

	await check('Pins lock each Path A race and gender, retain editable B, and explain conflicts and ties', async () => {
		const stages = [
			['origin', 'born'], ['first', 'first rebirth'], ['final', 'second rebirth'],
		];
		for (const [key, label] of stages) {
			await finderPage.getByRole('button', { name: `Pin Path A ${label} life`, exact: true }).focus();
			await finderPage.keyboard.press('Enter');
			assert.equal(await finderPage.locator(`#path-a-${key}`).isDisabled(), true);
			for (const gender of ['male', 'female']) {
				assert.equal(await finderPage.getByRole('button', { name: `Path A ${label} gender: ${gender}`, exact: true }).isDisabled(), true);
				assert.equal(await finderPage.getByRole('button', { name: `Path B ${label} gender: ${gender}`, exact: true }).isDisabled(), false);
			}
			assert.equal(await finderPage.locator(`#path-b-${key}`).isDisabled(), false);
			assert.equal(await finderPage.getByRole('button', { name: `Unpin Path A ${label} life`, exact: true }).getAttribute('aria-pressed'), 'true');
			if (key === 'origin') {
				await finderPage.keyboard.press('Shift+Tab');
				assert.equal(await finderPage.evaluate(() => document.activeElement?.matches('#path-a-origin, button[aria-label^="Path A born gender"]')), false);
				await finderPage.keyboard.press('Tab');
				assert.equal(await finderPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Unpin Path A born life');
			}
			assert.deepEqual(await pathValues(finderPage, 'b'), untouchedB);
			if (key === 'first') {
				await assertFinderCount(finderPage, 4, 4);
				assert.equal(await finderPage.locator('.finder-result').getByText('Path A', { exact: true }).count(), 1);
				assert.equal(await finderPage.locator('.finder-result').getByText('Tied', { exact: true }).count(), 3);
				const routes = await finderPage.locator('.finder-result-route').allTextContents();
				assert.match(routes[1], /Centaur/);
				assert.match(routes[2], /Mage/);
				assert.match(routes[3], /Borg/);
			}
		}
		await assertFinderCount(finderPage, 1, 1);
		await finderPage.getByText('Path B differs from your pinned lives', { exact: true }).waitFor();
		const finalRace = finderPage.getByRole('combobox', { name: 'Final race', exact: true });
		assert.equal(await finalRace.inputValue(), 'same-as-a');
		assert.equal(await finalRace.isDisabled(), true);
		await finderPage.getByRole('button', { name: 'Find paths', exact: true }).click();
		assert.equal(await finderPage.getByRole('button', { name: /^Unpin Path A / }).count(), 3, 'Pinned lives remain reachable while the finder is closed');
		assert.equal(await finderPage.locator('.planner-pin-help').isVisible(), true);
		await finderPage.getByRole('button', { name: 'Unpin Path A second rebirth life', exact: true }).click();
		assert.equal(await finderPage.locator('#path-a-final').isDisabled(), false);
		await unpinAll(finderPage);
		assert.equal(await finderPage.locator('.life-pin, .planner-pin-help').count(), 0, 'Removing the last pin hides closed-finder controls');
		await openFinder(finderPage);
		assert.equal(await finalRace.isDisabled(), false);
		assert.equal(await finalRace.inputValue(), 'same-as-a');
	});

	await check('Unique minimum requirements accept blank, negative, zero and inclusive values; invalid edits pause', async () => {
		for (const stage of ['origin', 'first', 'final']) await finderPage.locator(`#path-a-${stage}`).selectOption('3');
		for (const label of ['born', 'first rebirth', 'second rebirth']) {
			await finderPage.getByRole('button', { name: `Pin Path A ${label} life`, exact: true }).click();
		}
		await finderPage.getByRole('combobox', { name: 'Main goal', exact: true }).selectOption('growth:strength');
		await assertFinderCount(finderPage, 1, 1);
		await finderPage.getByRole('button', { name: 'Add minimum requirement', exact: true }).click();
		const firstMetric = finderPage.getByRole('combobox', { name: 'Minimum metric 1', exact: true });
		await firstMetric.focus();
		await finderPage.keyboard.press('ArrowDown');
		assert.equal(await firstMetric.inputValue(), 'growth:intelligence');
		assert.equal(await firstMetric.evaluate((element) => element === document.activeElement), true, 'Changing a requirement metric keeps keyboard focus');
		await firstMetric.selectOption('resistance:hitRate');
		const hitRate = finderPage.getByRole('textbox', { name: 'Minimum Hit Rate', exact: true });
		assert.equal(await hitRate.inputValue(), '');
		await assertFinderCount(finderPage, 1, 1);
		assert.match(await finderPage.locator('.finder-result-requirements').textContent(), /Hit Rate.*[−-]5 points/);
		await hitRate.fill('-5');
		await assertFinderCount(finderPage, 1, 1);
		await hitRate.fill('-4');
		assert.equal(await finderPage.locator('.finder-result').count(), 0);
		assert.deepEqual(await pathValues(finderPage, 'b'), untouchedB);
		await hitRate.fill('-5');
		await finderPage.getByRole('button', { name: 'Add minimum requirement', exact: true }).click();
		const secondMetric = finderPage.getByRole('combobox', { name: 'Minimum metric 2', exact: true });
		const duplicate = secondMetric.locator('option[value="resistance:hitRate"]');
		assert.ok(await duplicate.count() === 0 || await duplicate.isDisabled(), 'A minimum metric cannot be selected twice');
		await secondMetric.selectOption('effectAffinity');
		const affinity = finderPage.getByRole('textbox', { name: 'Minimum Effect Affinity', exact: true });
		await affinity.fill('0');
		await assertFinderCount(finderPage, 1, 1);
		await affinity.fill('1');
		assert.equal(await finderPage.locator('.finder-result').count(), 0);
		await affinity.fill('0');
		await finderPage.getByRole('button', { name: 'Add minimum requirement', exact: true }).click();
		await finderPage.getByRole('combobox', { name: 'Minimum metric 3', exact: true }).selectOption('growth:strength');
		const attack = finderPage.getByRole('textbox', { name: 'Minimum Attack (STR)', exact: true });
		await attack.fill('3.625');
		await assertFinderCount(finderPage, 1, 1);
		await attack.fill('3.626');
		assert.equal(await finderPage.locator('.finder-result').count(), 0);
		await attack.fill('3.625');
		await hitRate.fill('not a number');
		assert.equal(await hitRate.getAttribute('aria-invalid'), 'true');
		await finderPage.locator('.finder-field-error').first().waitFor();
		await finderPage.locator('.finder-paused').waitFor();
		assert.equal(await finderPage.locator('.finder-result').count(), 1, 'Keep the last valid result while input is incomplete');
		assert.equal(await finderPage.getByRole('button', { name: /^Use as Path B:/ }).first().isDisabled(), true);
		assert.match(await finderPage.locator('.finder-result-delta').textContent(), /vs previous A/);
		assert.deepEqual(await pathValues(finderPage, 'b'), untouchedB);
		await finderPage.reload();
		await openPlanner(finderPage);
		assert.equal(await hitRate.inputValue(), 'not a number');
		assert.equal(await hitRate.getAttribute('aria-invalid'), 'true');
		await hitRate.fill('-5');
		await assertFinderCount(finderPage, 1, 1);
	});

	await check('Use as Path B applies only the chosen route, keeps final gender and focuses comparison', async () => {
		const a = await pathValues(finderPage, 'a');
		assert.deepEqual(a, { races: ['3', '3', '3'], genders: ['male', 'male', 'female'] });
		await assertTouchTargets(finderPage, 'Desktop finder and pin targets are at least 44px high');
		await finderPage.getByRole('button', { name: /^Use as Path B:/ }).first().focus();
		await finderPage.keyboard.press('Enter');
		assert.deepEqual(await pathValues(finderPage, 'a'), a);
		assert.deepEqual(await pathValues(finderPage, 'b'), a);
		assert.equal(await finderPage.evaluate(() => document.activeElement?.id), 'comparison-title');
		assert.equal(await finderPage.locator('.planner-pin-conflict').count(), 0);
		assert.equal(await finderPage.locator('.comparison-table .value-positive, .comparison-table .value-negative').count(), 0);
	});

	await check('Finder results and invalid-input explanations fit five responsive widths', async () => {
		await unpinAll(finderPage);
		await removeAllRequirements(finderPage);
		await finderPage.getByRole('combobox', { name: 'Final race', exact: true }).selectOption('any');
		await finderPage.getByRole('combobox', { name: 'Main goal', exact: true }).selectOption('damageBonusPercent');
		await assertFinderCount(finderPage, 10, 256);
		await finderPage.getByRole('button', { name: 'Show more paths', exact: true }).click();
		await assertFinderCount(finderPage, 20, 256);
		await finderPage.getByRole('button', { name: 'Add minimum requirement', exact: true }).click();
		await assertFinderCount(finderPage, 10, 256);
		await finderPage.setViewportSize({ width: 320, height: 1000 });
		await assertTouchTargets(finderPage, 'Mobile finder and pin targets are at least 44px high');
		await finderPage.getByRole('combobox', { name: 'Minimum metric 1', exact: true }).selectOption('resistance:hypnotizeResist');
		await finderPage.getByRole('textbox', { name: 'Minimum Hypnotize Resist', exact: true }).fill('invalid');
		await finderPage.locator('.finder-paused').waitFor();
		for (const width of [320, 599, 960, 1024, 1440]) {
			await finderPage.setViewportSize({ width, height: 1000 });
			await screenshot(finderPage, `finder-${width}`);
			await assertLayout(finderPage, `Finder results and input error layout at ${width}px`);
		}
	});

	await check('Legacy drafts migrate to v2, finder state reloads, and shared v1 links reset finder defaults', async () => {
		const migrated = await newPage();
		await migrated.goto(baseUrl.href);
		await migrated.locator('.combo-tile').first().waitFor();
		const legacy = {
			version: 1,
			a: { origin: { race: 2, gender: 'female' }, first: { race: 1, gender: 'male' }, final: { race: 3, gender: 'female' } },
			b: { origin: { race: 0, gender: 'male' }, first: { race: 0, gender: 'male' }, final: { race: 0, gender: 'male' } },
			comparing: true, showChartValues: false,
		};
		await migrated.evaluate((legacy) => {
			localStorage.clear();
			localStorage.setItem('osmw.reborn-planner.v1', JSON.stringify(legacy));
		}, legacy);
		await migrated.reload();
		await openPlanner(migrated);
		assert.deepEqual(await pathValues(migrated, 'a'), { races: ['2', '1', '3'], genders: ['female', 'male', 'female'] });
		assert.equal(await migrated.getByRole('checkbox', { name: 'Show chart values' }).isChecked(), false);
		assert.equal(await migrated.getByRole('button', { name: 'Find paths', exact: true }).getAttribute('aria-expanded'), 'false');
		assert.equal(await migrated.getByRole('button', { name: /^Unpin Path A / }).count(), 0);
		const stored = await migrated.evaluate(() => JSON.parse(localStorage.getItem('osmw.reborn-planner.v2')));
		assert.equal(stored.version, 2);
		assert.deepEqual(stored.finder, { open: false, pins: { origin: false, first: false, final: false }, finalRace: 'same-as-a', goal: null, requirements: [] });
		assert.equal(await migrated.evaluate(() => localStorage.getItem('osmw.reborn-planner.v1')), JSON.stringify(legacy));
		await openFinder(migrated);
		await migrated.getByRole('combobox', { name: 'Main goal', exact: true }).selectOption('growth:agility');
		await migrated.getByRole('combobox', { name: 'Final race', exact: true }).selectOption('any');
		await migrated.getByRole('button', { name: 'Pin Path A born life', exact: true }).click();
		await migrated.getByRole('button', { name: 'Add minimum requirement', exact: true }).click();
		await migrated.getByRole('combobox', { name: 'Minimum metric 1', exact: true }).selectOption('resistance:hitRate');
		await migrated.getByRole('textbox', { name: 'Minimum Hit Rate', exact: true }).fill('0');
		await migrated.reload();
		await openPlanner(migrated);
		assert.equal(await migrated.getByRole('button', { name: 'Find paths', exact: true }).getAttribute('aria-expanded'), 'true');
		assert.equal(await migrated.getByRole('combobox', { name: 'Main goal', exact: true }).inputValue(), 'growth:agility');
		assert.equal(await migrated.getByRole('combobox', { name: 'Final race', exact: true }).inputValue(), 'any');
		assert.equal(await migrated.getByRole('textbox', { name: 'Minimum Hit Rate', exact: true }).inputValue(), '0');
		assert.equal(await migrated.locator('#path-a-origin').isDisabled(), true);
		await migrated.goto(new URL('?planner=1&a=1f-0m-2f&b=3m-3m-3m', baseUrl).href);
		await migrated.locator('#path-b').waitFor();
		assert.deepEqual(await pathValues(migrated, 'a'), { races: ['1', '0', '2'], genders: ['female', 'male', 'female'] });
		assert.equal(await migrated.getByRole('checkbox', { name: 'Show chart values' }).isChecked(), false);
		assert.equal(await migrated.getByRole('button', { name: 'Find paths', exact: true }).getAttribute('aria-expanded'), 'false');
		assert.equal(await migrated.getByRole('button', { name: /^Unpin Path A / }).count(), 0);
		await openFinder(migrated);
		assert.equal(await migrated.getByRole('combobox', { name: 'Main goal', exact: true }).inputValue(), '');
		assert.equal(await migrated.getByRole('combobox', { name: 'Final race', exact: true }).inputValue(), 'same-as-a');
		assert.equal(await migrated.getByRole('combobox', { name: /^Minimum metric / }).count(), 0);
	});

	await check('Finder and pins remain usable in memory when browser storage fails', async () => {
		const isolated = await newPage({ storageDisabled: true });
		await isolated.goto(baseUrl.href);
		await openPlanner(isolated);
		await openFinder(isolated);
		await isolated.getByRole('combobox', { name: 'Main goal', exact: true }).selectOption('growth:strength');
		await isolated.getByRole('combobox', { name: 'Final race', exact: true }).selectOption('any');
		await isolated.getByRole('button', { name: 'Pin Path A born life', exact: true }).click();
		await assertFinderCount(isolated, 10, 32);
		await isolated.getByRole('button', { name: 'The Wall', exact: true }).click();
		await openPlanner(isolated);
		assert.equal(await isolated.locator('#path-a-origin').isDisabled(), true);
		await assertFinderCount(isolated, 10, 32);
		await isolated.evaluate(() => {
			history.pushState(null, '', '/?planner=bad');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await isolated.locator('.planner-notice').waitFor();
		assert.equal(await isolated.getByRole('combobox', { name: 'Main goal', exact: true }).inputValue(), 'growth:strength');
		assert.equal(await isolated.locator('#path-a-origin').isDisabled(), true);
		await assertFinderCount(isolated, 10, 32);
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
