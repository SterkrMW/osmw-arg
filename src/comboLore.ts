export interface ComboLore {
	name: string;
	flavourText: string;
}

// Race indices: 0 = Human, 1 = Centaur, 2 = Mage, 3 = Borg
// Key format: "${tier1NewRace}_${tier2NewRace}"
// tier1NewRace = race chosen at end of first rebirth
// tier2NewRace = race chosen at end of second rebirth
export const comboLore: Record<string, ComboLore> = {
	// ── Human → * ────────────────────────────────────────────────────────────
	'0_0': {
		name: 'Oathkeeper',
		flavourText:
			"Generations of unyielding lineage have forged a constitution that scoffs at both physical toxins and the siphoning of one's spirit. While they may lack a natural spark for arcane intuition, an Oathkeeper's resolve is as sturdy as the ground they stand upon—rarely wavering in health or magical vitality.",
	},
	'0_1': {
		name: 'Steelheart',
		flavourText:
			"Possessing the heavy-hooved stability of the plains and the stubborn grit of humanity, Steelhearts are nearly impossible to daze or drive into madness. They trade the complexities of high-minded philosophy for a pulse that never falters, boasting an unshakeable equilibrium that remains calm amidst the most chaotic bedlam.",
	},
	'0_2': {
		name: 'Oathbreaker',
		flavourText:
			"Turning their backs on traditional safety, these seekers have traded ancestral hardiness for the searing clarity of the weave. Their minds expand with every trial, allowing them to channel their techniques with a lethal precision and affinity that makes their former kin tremble.",
	},
	'0_3': {
		name: 'Ironwrought',
		flavourText:
			"A seamless fusion of flesh and cold logic, the Ironwrought is built to endure the relentless grind of physical and energetic attrition. While they lack the erratic passion for wild rages or lucky strikes, their calculated evolution ensures their intellect remains their greatest upgrade, even as they stand unfazed by the heaviest of blows.",
	},

	// ── Centaur → * ──────────────────────────────────────────────────────────
	'1_0': {
		name: 'Assassin',
		flavourText:
			"The centaur trades the open steppe for the weight of two feet on solid earth. Friends say they've slowed down. Enemies learn that slow doesn't mean still.",
	},
	'1_1': {
		name: 'Wind Knight',
		flavourText:
			'To run until the world ends, and then keep running through whatever comes after. This path belongs to those who believe the horizon is not a limit but an invitation.',
	},
	'1_2': {
		name: 'Forest Druid',
		flavourText:
			'From thundering hooves to crackling arcs of spell-fire — the leap seems impossible until you realise both draw power from the same restless energy that splits the sky.',
	},
	'1_3': {
		name: 'Flash Strike',
		flavourText:
			"Speed without direction is chaos. The centaur's second transformation channels every gallop, every charge, into calculated violence. The battlefield becomes a circuit. Every move, optimised.",
	},

	// ── Mage → * ─────────────────────────────────────────────────────────────
	'2_0': {
		name: 'Unwoven',
		flavourText:
			'Most mages ascend. This one chose descent — back into the warmth of mortal life, carrying embers of the arcane carefully cupped in ordinary hands. The spells have not gone. They simply learned patience.',
	},
	'2_1': {
		name: 'Oracle',
		flavourText:
			"Incantations whispered across open skies, runes traced in dust by hooves that never stop moving. Magic was never meant to be cast from towers. It was always meant to be ridden.",
	},
	'2_2': {
		name: 'Archmage',
		flavourText:
			'Every answer births three new questions. To be twice-born of magic is to accept that comprehension is a spiral, not a ladder — and to love the turning anyway.',
	},
	'2_3': {
		name: 'Technomancer',
		flavourText:
			"A lifetime of incantations distilled into a cold algorithm. The mage's tremor is gone. The doubt is gone. What remains weighs every spell against every counter, and casts only the answer.",
	},
	// ── Borg → * ─────────────────────────────────────────────────────────────
	'3_0': {
		name: 'Reclaimed Flesh',
		flavourText:
			'To shed the chassis is no small unmaking. The heartbeat felt foreign at first — too irregular, too slow. But something old and patient had been waiting in the dark of their own ribs, and it knew them when they came home.',
	},
	'3_1': {
		name: 'Circuit Breaker',
		flavourText:
			'The Borg chassis cracks open and something wild steps out. No directives. No optimal pathing. Just four legs and the horizon and the pure, terrifying freedom of running without a purpose.',
	},
	'3_2': {
		name: 'Cognisant Flame',
		flavourText:
			'The machine learned to feel. The mage learned to think without feeling. Somewhere between those two impossible things, a third way opened — and those who found it keep the secret well.',
	},
	'3_3': {
		name: 'Apex Protocol',
		flavourText:
			"Twice rebuilt. Twice perfected. The first iteration was engineering. The second is something the engineers never planned for — a will that writes its own code and answers to nothing.",
	},
};
