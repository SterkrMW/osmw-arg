import { describe, expect, it, vi } from 'vitest';
import { CharacterGender, CharacterRace } from '#enums/CharacterClass';
import { recalculateFromHistory, roundGrowthRates } from '#actions/Actions/Player/RebirthConfig';
import { PlayerCreator } from '#state/Player/PlayerCreator';
import { PlayerReborn } from '#state/Player/PlayerReborn';
import { Stats } from '#state/Stats/Stats';
import type { Player } from '#state/Player/Player';
import type { RebirthBonuses } from '#state/Player/PlayerMisc';
import { calculatePath } from '../src/planner';
import type { PathSelection, Race } from '../src/planner';
import type { Gender, StatKey } from '../src/rebornCombos';

// Keep the real calculation graph, but route its unrelated import-time validation
// messages to the test console instead of opening game-server log files.
vi.mock('#log/Logger', () => ({
	Logger: console,
	setConsoleSuppressed: () => undefined,
	setLogLevel: () => undefined,
	getLogLevel: () => 'info',
	enableGlobalErrorCatching: () => undefined,
}));

const races: Race[] = [0, 1, 2, 3];
const genders: Gender[] = ['male', 'female'];
const genderId = (gender: Gender): CharacterGender =>
	gender === 'male' ? CharacterGender.Male : CharacterGender.Female;
const groups = { strength: 'attack', intelligence: 'mp', agility: 'speed', stamina: 'hp' } as const;

describe('planner parity with the real game-server calculation', () => {
	it('matches all 256 histories with real StatGroup setters and both final genders', () => {
		let count = 0;
		for (const x of races)
			for (const y of races)
				for (const z of races) {
					for (const gx of genders)
						for (const gy of genders)
							for (const gz of genders) {
								const selection: PathSelection = {
									origin: { race: x, gender: gx },
									first: { race: y, gender: gy },
									final: { race: z, gender: gz },
								};
								const rebirth: RebirthBonuses = {
									rebirthLevel: 2,
									rebirthHistory: [
										{
											previousRace: x as CharacterRace,
											previousGender: genderId(gx),
											chosenClass: y * 2 + genderId(gy),
											levelAtRebirth: 100,
										},
										{
											previousRace: y as CharacterRace,
											previousGender: genderId(gy),
											chosenClass: z * 2 + genderId(gz),
											levelAtRebirth: 120,
										},
									],
									bonusStatPoints: 0,
									resistanceBonuses: {},
									raceStatBonus: {},
									statGrowthBonuses: {},
									rebirthEffectAffinity: 0,
									rebirthDamageBonusPercent: 0,
								};
								recalculateFromHistory(rebirth);
								const stats = new Stats(PlayerCreator.createStats(z as CharacterRace));
								const player = {
									level: { reborn: 2 },
									fightData: { stats },
									misc: { rebirth },
								} as unknown as Player;
								new PlayerReborn(player).applyGrowthRateBonuses();
								roundGrowthRates(player);
								const actual = calculatePath(selection);
								const context = JSON.stringify(selection);
								for (const [stat, group] of Object.entries(groups)) {
									expect(actual.growthRates[stat as StatKey], context).toBe(
										stats[group].growthRate,
									);
									expect(actual.additiveGrowth[stat as StatKey], context).toBeCloseTo(
										rebirth.statGrowthBonuses[stat] ?? 0,
										10,
									);
									expect(actual.raceBonusPercent[stat as StatKey], context).toBe(
										rebirth.raceStatBonus[stat] ?? 0,
									);
								}
								expect(actual.resistances, context).toEqual(
									Object.fromEntries(
										Object.entries(rebirth.resistanceBonuses).filter(([, value]) => value !== 0),
									),
								);
								expect(actual.effectAffinity, context).toBe(rebirth.rebirthEffectAffinity);
								expect(actual.damageBonusPercent, context).toBe(rebirth.rebirthDamageBonusPercent);
								count++;
							}
				}
		expect(count).toBe(512);
	});
});
