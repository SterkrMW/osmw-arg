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
		name: 'The Unbroken Covenant',
		flavourText:
			'Some truths cannot be abandoned. Twice born of mortal clay, this warrior chose humanity not from lack of ambition, but from deep conviction. The old gods take notice of such stubborn faith.',
	},
	'0_1': {
		name: 'The Wandering Soul',
		flavourText:
			'Born in village lanes, reborn on endless plains. The human heart carries maps to places it has never been — and the centaur blood answers that restless calling.',
	},
	'0_2': {
		name: 'The Awakened Mind',
		flavourText:
			"First life: flesh and feeling. Second life: something far colder and far brighter. Those who walk this path say they can still remember what it felt like to be afraid of the dark.",
	},
	'0_3': {
		name: 'The Iron Resolve',
		flavourText:
			"A human's will transmuted into steel and circuitry. Where others see contradiction, this path sees inevitability — every doubt burned away until only purpose remains.",
	},

	// ── Centaur → * ──────────────────────────────────────────────────────────
	'1_0': {
		name: 'The Grounded Wanderer',
		flavourText:
			"The centaur trades the open steppe for the weight of two feet on solid earth. Friends say they've slowed down. Enemies learn that slow doesn't mean still.",
	},
	'1_1': {
		name: 'The Endless Gallop',
		flavourText:
			'To run until the world ends, and then keep running through whatever comes after. This path belongs to those who believe the horizon is not a limit but an invitation.',
	},
	'1_2': {
		name: 'The Storm Caller',
		flavourText:
			'From thundering hooves to crackling arcs of spell-fire — the leap seems impossible until you realise both draw power from the same restless energy that splits the sky.',
	},
	'1_3': {
		name: 'The Engine of War',
		flavourText:
			"Speed without direction is chaos. The centaur's second transformation channels every gallop, every charge, into calculated violence. The battlefield becomes a circuit. Every move, optimised.",
	},

	// ── Mage → * ─────────────────────────────────────────────────────────────
	'2_0': {
		name: 'The Descending Star',
		flavourText:
			'Most mages ascend. This one chose descent — back into the warmth of mortal life, carrying embers of the arcane carefully cupped in ordinary hands. The spells have not gone. They simply learned patience.',
	},
	'2_1': {
		name: 'The Wind-Weaver',
		flavourText:
			"Incantations whispered across open skies, runes traced in dust by hooves that never stop moving. Magic was never meant to be cast from towers. It was always meant to be ridden.",
	},
	'2_2': {
		name: 'The Endless Theorem',
		flavourText:
			'Every answer births three new questions. To be twice-born of magic is to accept that comprehension is a spiral, not a ladder — and to love the turning anyway.',
	},
	'2_3': {
		name: 'The Calculated Annihilation',
		flavourText:
			"A lifetime of incantations distilled into a cold algorithm. The mage's tremor is gone. The doubt is gone. What remains weighs every spell against every counter, and casts only the answer.",
	},
	// ── Borg → * ─────────────────────────────────────────────────────────────
	'3_0': {
		name: 'The Reclaimed',
		flavourText:
			'To shed the chassis is no small unmaking. The heartbeat felt foreign at first — too irregular, too slow. But something old and patient had been waiting in the dark of their own ribs, and it knew them when they came home.',
	},
	'3_1': {
		name: 'The Unfettered Circuit',
		flavourText:
			'The Borg chassis cracks open and something wild steps out. No directives. No optimal pathing. Just four legs and the horizon and the pure, terrifying freedom of running without a purpose.',
	},
	'3_2': {
		name: 'The Cognisant Flame',
		flavourText:
			'The machine learned to feel. The mage learned to think without feeling. Somewhere between those two impossible things, a third way opened — and those who found it keep the secret well.',
	},
	'3_3': {
		name: 'The Absolute Protocol',
		flavourText:
			"Twice rebuilt. Twice perfected. The first iteration was engineering. The second is something the engineers never planned for — a will that writes its own code and answers to nothing.",
	},
};
