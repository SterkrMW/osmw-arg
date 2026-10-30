import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raceNames = ['Human', 'Centaur', 'Mage', 'Borg'];
const statKeys = ['strength', 'intelligence', 'agility', 'stamina'];
const growthFields = { strength: 'attack', intelligence: 'mp', agility: 'speed', stamina: 'hp' };
const sourcePaths = {
	config: 'src/game-server/GameActions/Actions/Player/RebirthConfig.ts',
	creator: 'src/game-server/GameState/Player/PlayerCreator.ts',
	reborn: 'src/game-server/GameState/Player/PlayerReborn.ts',
	statConfig: 'src/game-server/GameState/Stats/StatConfig.ts',
	statGroup: 'src/game-server/GameState/Stats/StatGroup.ts',
	classes: 'src/game-server/Enums/CharacterClass.ts',
	parser: 'scripts/generateRebornCombos.mjs',
};

function requireShape(condition, message) {
	if (!condition) throw new Error(`Unsupported server data: ${message}`);
}

function variable(source, name) {
	let found;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
			requireShape(!found, `duplicate ${name}`);
			found = node.initializer;
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	if (found && ts.isAsExpression(found)) found = found.expression;
	requireShape(found, `missing ${name}`);
	return found;
}

function numeric(node, description) {
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
		return -numeric(node.operand, description);
	}
	throw new Error(`Unsupported server data: ${description} must be a numeric literal`);
}

function propertyName(node) {
	requireShape(
		ts.isIdentifier(node) || ts.isStringLiteral(node),
		'computed or spread preset field',
	);
	return node.text;
}

function properties(node, description) {
	requireShape(ts.isObjectLiteralExpression(node), `${description} must be an object literal`);
	const result = {};
	for (const field of node.properties) {
		requireShape(ts.isPropertyAssignment(field), `${description} has a non-literal field`);
		const name = propertyName(field.name);
		requireShape(!Object.hasOwn(result, name), `${description} has duplicate ${name}`);
		result[name] = field.initializer;
	}
	return result;
}

function exactFields(fields, required, description) {
	assert.deepEqual(
		Object.keys(fields).sort(),
		[...required].sort(),
		`Unsupported ${description} fields`,
	);
}

function numericMap(node, description, allowedKeys) {
	const fields = properties(node, description);
	const out = {};
	for (const [key, value] of Object.entries(fields)) {
		if (allowedKeys) requireShape(allowedKeys.includes(key), `${description}: unknown stat ${key}`);
		out[key] = numeric(value, `${description}.${key}`);
	}
	return out;
}

function readBonus(node, description, preset) {
	const fields = properties(node, description);
	exactFields(
		fields,
		preset
			? ['resistanceBonuses', 'statGrowthBonuses', 'raceStatBonus', 'sameRace']
			: ['resistanceBonuses', 'statGrowthBonuses', 'effectAffinity', 'damageBonusPercent'],
		description,
	);
	const result = {
		resistanceBonuses: numericMap(fields.resistanceBonuses, `${description}.resistanceBonuses`),
		statGrowthBonuses: numericMap(
			fields.statGrowthBonuses,
			`${description}.statGrowthBonuses`,
			statKeys,
		),
	};
	if (preset) {
		const raceBonus = properties(fields.raceStatBonus, `${description}.raceStatBonus`);
		exactFields(raceBonus, ['stat', 'bonus'], `${description}.raceStatBonus`);
		requireShape(
			ts.isStringLiteral(raceBonus.stat) && statKeys.includes(raceBonus.stat.text),
			`${description}: invalid race stat`,
		);
		result.raceStatBonus = {
			stat: raceBonus.stat.text,
			bonus: numeric(raceBonus.bonus, 'race bonus'),
		};
		const same = properties(fields.sameRace, `${description}.sameRace`);
		exactFields(
			same,
			['resistanceBonuses', 'effectAffinity', 'damageBonusPercent'],
			`${description}.sameRace`,
		);
		result.sameRace = {
			resistanceBonuses: numericMap(
				same.resistanceBonuses,
				`${description}.sameRace.resistanceBonuses`,
			),
			effectAffinity: numeric(same.effectAffinity, 'same-race affinity'),
			damageBonusPercent: numeric(same.damageBonusPercent, 'same-race damage'),
		};
	} else {
		result.effectAffinity = numeric(fields.effectAffinity, 'combo affinity');
		result.damageBonusPercent = numeric(fields.damageBonusPercent, 'combo damage');
	}
	return result;
}

function verifyPresets(source, parsed) {
	for (const tier of ['tier1', 'tier2']) {
		const fields = properties(variable(source, `${tier}Presets`), tier);
		const keys = raceNames.flatMap(race => ['male', 'female'].map(gender => `${gender}${race}`));
		exactFields(fields, keys, tier);
		for (const key of keys)
			assert.deepEqual(readBonus(fields[key], `${tier}.${key}`, true), parsed[tier][key]);
	}
	const secrets = variable(source, 'secretComboBonuses');
	requireShape(ts.isObjectLiteralExpression(secrets), 'secret combos must be an object literal');
	const checked = {};
	for (const field of secrets.properties) {
		requireShape(
			ts.isPropertyAssignment(field) && ts.isComputedPropertyName(field.name),
			'unexpected secret combo key',
		);
		const match =
			/^\[`\$\{CharacterRace\.(Human|Centaur|Mage|Borg)\}_\$\{CharacterRace\.(Human|Centaur|Mage|Borg)\}`\]$/.exec(
				field.name.getText(source),
			);
		requireShape(match, 'unexpected secret combo key expression');
		const key = `${match[1].toLowerCase()}_${match[2].toLowerCase()}`;
		requireShape(!Object.hasOwn(checked, key), `duplicate secret combo ${key}`);
		checked[key] = readBonus(field.initializer, `secret combo ${key}`, false);
	}
	assert.deepEqual(checked, parsed.secrets, 'Server parser omitted or changed a secret combo');
	exactFields(
		checked,
		raceNames.flatMap(origin =>
			raceNames.map(first => `${origin.toLowerCase()}_${first.toLowerCase()}`),
		),
		'secret combo catalog',
	);
}

function classMember(source, className, name, kind = ts.isMethodDeclaration) {
	const cls = source.statements.find(
		node => ts.isClassDeclaration(node) && node.name?.text === className,
	);
	requireShape(cls, `missing class ${className}`);
	const member = cls.members.find(node => kind(node) && node.name?.getText(source) === name);
	requireShape(member?.body, `missing ${className}.${name}`);
	return member;
}

const printer = ts.createPrinter({ removeComments: true });
function canonical(node, source) {
	return printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, '');
}

function assertBody(body, expected, source, description) {
	const fixture = ts.createSourceFile(
		'expected.ts',
		`function expected() ${expected}`,
		ts.ScriptTarget.Latest,
		true,
	);
	assert.equal(
		canonical(body, source),
		canonical(fixture.statements[0].body, fixture),
		`Unsupported ${description}; review the planner formula before exporting`,
	);
}

function verifyRuntime(sources) {
	const member = classMember(sources.reborn, 'PlayerReborn', 'applyGrowthRateBonuses');
	let flatExpression;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(sources.reborn) === 'totalRebornBonus')
			flatExpression = node.initializer;
		ts.forEachChild(node, visit);
	}
	visit(member.body);
	requireShape(
		flatExpression &&
			ts.isBinaryExpression(flatExpression) &&
			ts.isBinaryExpression(flatExpression.right),
		'flat rebirth multiplier',
	);
	const flatGrowthBonusPerRebirth = numeric(flatExpression.right.right, 'flat rebirth coefficient');
	const fields = ['hp', 'mp', 'attack', 'speed'];
	const cases = [
		['stamina', 'hp'],
		['intelligence', 'mp'],
		['strength', 'attack'],
		['agility', 'speed'],
	];
	assertBody(
		member.body,
		`{
		if (this.player.level.reborn === 0) return;
		const totalRebornBonus = 1 + this.player.level.reborn * ${flatGrowthBonusPerRebirth};
		${fields.map(field => `this.player.fightData.stats.${field}.growthRate *= totalRebornBonus;`).join('\n')}
		const raceStatBonus = this.player.misc.rebirth.raceStatBonus;
		for (const [statType, bonus] of Object.entries(raceStatBonus)) {
			const bonusMultiplier = 1 + bonus / 100;
			switch (statType) { ${cases.map(([stat, field]) => `case '${stat}': this.player.fightData.stats.${field}.growthRate *= bonusMultiplier; break;`).join('\n')} }
		}
		const statGrowthBonuses = this.player.misc.rebirth.statGrowthBonuses;
		for (const [statType, bonus] of Object.entries(statGrowthBonuses)) {
			switch (statType) { ${cases.map(([stat, field]) => `case '${stat}': this.player.fightData.stats.${field}.growthRate += bonus; break;`).join('\n')} }
		}
	}`,
		sources.reborn,
		'rebirth growth application',
	);
	const config = properties(variable(sources.statConfig, 'StatConfig'), 'StatConfig');
	const growthRateDecimals = numeric(config.growthRateDecimals, 'growth precision');
	requireShape(
		Number.isInteger(growthRateDecimals) && growthRateDecimals >= 0 && growthRateDecimals <= 6,
		'growth precision must be 0–6',
	);
	const round = sources.statConfig.statements.find(
		node => ts.isFunctionDeclaration(node) && node.name?.text === 'roundGrowthRate',
	);
	requireShape(round?.body, 'missing roundGrowthRate');
	assertBody(
		round.body,
		'{ const factor = 10 ** StatConfig.growthRateDecimals; return Math.round(value * factor) / factor; }',
		sources.statConfig,
		'growth rounding',
	);
	const setter = classMember(
		sources.statGroup,
		'StatGroup',
		'growthRate',
		ts.isSetAccessorDeclaration,
	);
	assertBody(
		setter.body,
		'{ this._growthRate = roundGrowthRate(growthRate); this.onChange(); }',
		sources.statGroup,
		'growth setter',
	);
	return { flatGrowthBonusPerRebirth, growthRateDecimals };
}

function readBaseGrowth(source) {
	const method = classMember(source, 'PlayerCreator', 'getStatRates');
	requireShape(
		method.body.statements.length === 1 && ts.isSwitchStatement(method.body.statements[0]),
		'race rates switch',
	);
	const switchNode = method.body.statements[0];
	requireShape(switchNode.expression.getText(source) === 'race', 'race rates switch expression');
	const result = {};
	for (const clause of switchNode.caseBlock.clauses) {
		requireShape(
			ts.isCaseClause(clause) &&
				clause.statements.length === 1 &&
				ts.isReturnStatement(clause.statements[0]),
			'race rates case',
		);
		const name = clause.expression.getText(source).replace(/^CharacterRace\./, '');
		const race = raceNames.indexOf(name);
		requireShape(race >= 0 && !Object.hasOwn(result, race), 'unknown or duplicate base race');
		const values = numericMap(clause.statements[0].expression, `${name} base rates`);
		exactFields(
			values,
			[
				'sta',
				'int',
				'str',
				'agi',
				'growthRate',
				'hpGrowthRate',
				'mpGrowthRate',
				'attackGrowthRate',
				'speedGrowthRate',
			],
			`${name} base rates`,
		);
		result[race] = Object.fromEntries(
			Object.entries(growthFields).map(([stat, field]) => [stat, values[`${field}GrowthRate`]]),
		);
	}
	requireShape(Object.keys(result).length === 4, 'missing base race');
	return result;
}

function verifyEnums(source) {
	for (const [enumName, expected] of [
		['CharacterRace', raceNames],
		['CharacterGender', ['Male', 'Female']],
	]) {
		const declaration = source.statements.find(
			node => ts.isEnumDeclaration(node) && node.name.text === enumName,
		);
		requireShape(declaration?.members.length === expected.length, `changed ${enumName}`);
		declaration.members.forEach((member, index) => {
			requireShape(
				member.name.getText(source) === expected[index] &&
					member.initializer &&
					numeric(member.initializer, enumName) === index,
				`changed ${enumName} values`,
			);
		});
	}
}

/** Reads authoritative source only. It never imports the server runtime or starts services. */
export async function buildPlannerData(serverRoot = path.resolve(appRoot, '../../..')) {
	const entries = await Promise.all(
		Object.entries(sourcePaths).map(async ([key, relative]) => [
			key,
			await readFile(path.join(serverRoot, relative), 'utf8'),
		]),
	);
	const texts = Object.fromEntries(entries);
	const sources = Object.fromEntries(
		entries
			.filter(([key]) => key !== 'parser')
			.map(([key, text]) => [
				key,
				ts.createSourceFile(sourcePaths[key], text, ts.ScriptTarget.Latest, true),
			]),
	);
	const { parseRebirthConfig } = await import(
		pathToFileURL(path.join(serverRoot, sourcePaths.parser)).href
	);
	const parsed = parseRebirthConfig(texts.config);
	verifyEnums(sources.classes);
	verifyPresets(sources.config, parsed);
	const runtime = verifyRuntime(sources);
	return {
		schemaVersion: 1,
		sources: Object.fromEntries(
			entries.map(([key, text]) => [
				sourcePaths[key],
				createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex'),
			]),
		),
		...runtime,
		baseGrowthByRace: readBaseGrowth(sources.creator),
		tier1: parsed.tier1,
		tier2: parsed.tier2,
		secretCombos: parsed.secrets,
	};
}

async function main() {
	const args = process.argv.slice(2);
	const check = args.includes('--check');
	const rootIndex = args.indexOf('--server-root');
	const serverRoot = rootIndex < 0 ? undefined : path.resolve(args[rootIndex + 1] ?? '');
	requireShape(
		args.every(
			(arg, index) =>
				arg === '--check' || arg === '--server-root' || (index === rootIndex + 1 && rootIndex >= 0),
		),
		'unknown exporter argument',
	);
	if (rootIndex >= 0)
		requireShape(
			args[rootIndex + 1] && !args[rootIndex + 1].startsWith('--'),
			'missing --server-root value',
		);
	const data = await buildPlannerData(serverRoot);
	const destination = path.join(appRoot, 'src/assets/reborn-planner.json');
	if (check) {
		assert.deepEqual(
			JSON.parse(await readFile(destination, 'utf8')),
			data,
			'Planner data differs from the server; run npm run data:export and review the diff',
		);
		console.log('Planner data matches the current server sources.');
	} else {
		await writeFile(destination, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
		console.log('Updated src/assets/reborn-planner.json from the current server sources.');
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
