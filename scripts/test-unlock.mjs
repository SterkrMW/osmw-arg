/**
 * Fires test combo-unlock payloads at the local vercel dev server.
 *
 * Usage:
 *   node scripts/test-unlock.mjs                    # unlock one combo interactively
 *   node scripts/test-unlock.mjs 3_2 "TestPlayer"   # unlock Borg→Mage as TestPlayer
 *   node scripts/test-unlock.mjs all                # unlock all 16 combos with dummy names
 */

const BASE_URL = process.env.DEV_URL ?? 'http://localhost:3000';
const API_KEY = process.env.COMBO_UNLOCK_API_KEY ?? 'dev-secret';

const RACE_NAMES = ['Human', 'Centaur', 'Mage', 'Borg'];
const ALL_KEYS = [0, 1, 2, 3].flatMap(r1 => [0, 1, 2, 3].map(r2 => `${r1}_${r2}`));

async function unlock(comboKey, discovererName) {
	const res = await fetch(`${BASE_URL}/api/unlock`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
		body: JSON.stringify({ comboKey, discovererName }),
	});
	const body = await res.json();
	const [r1, r2] = comboKey.split('_').map(Number);
	const label = `${RACE_NAMES[r1]} → ${RACE_NAMES[r2]}`;
	if (res.ok) {
		console.log(`${body.firstUnlock ? '✓ UNLOCKED' : '  already set'} [${comboKey}] ${label} by "${discovererName}"`);
	} else {
		console.error(`✗ ${res.status} [${comboKey}]`, body);
	}
}

const [,, arg1, arg2] = process.argv;

if (arg1 === 'all') {
	for (const key of ALL_KEYS) {
		const [r1, r2] = key.split('_').map(Number);
		await unlock(key, `${RACE_NAMES[r1]}Explorer`);
	}
} else if (arg1) {
	await unlock(arg1, arg2 ?? 'TestPlayer');
} else {
	// Default: unlock a single interesting combo
	await unlock('3_2', 'TestPlayer');
	console.log('\nTip: run with "all" to unlock all 16, or pass a key + name:');
	console.log('  node scripts/test-unlock.mjs 0_3 "MyCharacter"');
}
