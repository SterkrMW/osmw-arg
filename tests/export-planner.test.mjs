import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildPlannerData } from '../scripts/export-planner.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(appRoot, '../../..');
const config = 'src/game-server/GameActions/Actions/Player/RebirthConfig.ts';
const creator = 'src/game-server/GameState/Player/PlayerCreator.ts';
const reborn = 'src/game-server/GameState/Player/PlayerReborn.ts';
const files = [
	config,
	creator,
	reborn,
	'src/game-server/GameState/Stats/StatConfig.ts',
	'src/game-server/GameState/Stats/StatGroup.ts',
	'src/game-server/Enums/CharacterClass.ts',
	'scripts/generateRebornCombos.mjs',
];

async function withServerCopy(run) {
	const prefix = path.join(path.resolve(tmpdir()), 'osmw-planner-test-');
	const directory = await mkdtemp(prefix);
	try {
		await Promise.all(
			files.map(async file => {
				const destination = path.join(directory, file);
				await mkdir(path.dirname(destination), { recursive: true });
				await writeFile(destination, await readFile(path.join(serverRoot, file), 'utf8'));
			}),
		);
		await run(directory);
	} finally {
		const resolved = path.resolve(directory);
		assert.ok(
			resolved.startsWith(prefix) && path.dirname(resolved) === path.resolve(tmpdir()),
			'Only delete the generated test directory',
		);
		await rm(resolved, { recursive: true, force: true });
	}
}

async function replace(directory, file, before, after) {
	const destination = path.join(directory, file);
	const text = (await readFile(destination, 'utf8')).replace(/\r\n/g, '\n');
	assert.ok(text.includes(before), `Missing test mutation anchor: ${before}`);
	await writeFile(destination, text.replace(before, after));
}

test('committed planner fixture matches authoritative source without timestamps', async () => {
	assert.deepEqual(
		await buildPlannerData(serverRoot),
		JSON.parse(await readFile(path.join(appRoot, 'src/assets/reborn-planner.json'), 'utf8')),
	);
});

test('exporter rejects unsupported per-skill bonuses rather than silently dropping them', async () => {
	await withServerCopy(async directory => {
		// Match an authored preset, not the legacy raceSkillBonuses table or a type declaration.
		await replace(
			directory,
			config,
			'sameRace: {\n\t\t\tresistanceBonuses: {},',
			'sameRace: {\n\t\t\tskillBonuses: {},\n\t\t\tresistanceBonuses: {},',
		);
		await assert.rejects(buildPlannerData(directory), /Unsupported .*sameRace fields/);
	});
});

test('exporter rejects changed runtime arithmetic', async () => {
	await withServerCopy(async directory => {
		await replace(
			directory,
			reborn,
			'growthRate *= bonusMultiplier',
			'growthRate += bonusMultiplier',
		);
		await assert.rejects(buildPlannerData(directory), /Unsupported rebirth growth application/);
	});
});

test('exporter rejects an incomplete secret combo catalog', async () => {
	await withServerCopy(async directory => {
		const destination = path.join(directory, config);
		const text = (await readFile(destination, 'utf8')).replace(/\r\n/g, '\n');
		const start = text.indexOf('[`${CharacterRace.Human}_${CharacterRace.Human}`]: {');
		const end = text.indexOf('\n\t},', start) + '\n\t},'.length;
		assert.ok(start >= 0 && end > start, 'Missing complete test combo');
		await writeFile(destination, text.slice(0, start) + text.slice(end));
		await assert.rejects(buildPlannerData(directory), /Unsupported secret combo catalog fields/);
	});
});

test('exporter reads changed literal balance values without hard-coded defaults', async () => {
	await withServerCopy(async directory => {
		await replace(directory, creator, 'attackGrowthRate: 2.15', 'attackGrowthRate: 2.2');
		await replace(
			directory,
			reborn,
			'this.player.level.reborn * 0.05',
			'this.player.level.reborn * 0.06',
		);
		const data = await buildPlannerData(directory);
		assert.equal(data.baseGrowthByRace[3].strength, 2.2);
		assert.equal(data.flatGrowthBonusPerRebirth, 0.06);
	});
});

test('exporter rejects non-literal base rates and unknown growth stat keys', async () => {
	await withServerCopy(async directory => {
		await replace(directory, creator, 'attackGrowthRate: 2.15', 'attackGrowthRate: 2 + 0.15');
		await assert.rejects(buildPlannerData(directory), /must be a numeric literal/);
	});
	await withServerCopy(async directory => {
		await replace(
			directory,
			config,
			'statGrowthBonuses: {},',
			'statGrowthBonuses: { unknownGrowth: 1 },',
		);
		await assert.rejects(buildPlannerData(directory), /unknown stat unknownGrowth/);
	});
});
