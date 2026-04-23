import express from 'express';
import { getKv } from '../api/_kv.js';
import type { UnlockedComboEntry } from '../src/types.js';

const app = express();
app.use(express.json());

const VALID_RACES = [0, 1, 2, 3];
const ALL_COMBO_KEYS = VALID_RACES.flatMap(r1 => VALID_RACES.map(r2 => `combo:${r1}_${r2}`));
const API_KEY = process.env.COMBO_UNLOCK_API_KEY ?? 'dev-secret';

function isValidComboKey(key: unknown): key is string {
	if (typeof key !== 'string') return false;
	const [a, b] = key.split('_').map(Number);
	return VALID_RACES.includes(a) && VALID_RACES.includes(b) && key.split('_').length === 2;
}

app.post('/api/unlock', async (req, res) => {
	if (req.headers['x-api-key'] !== API_KEY) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	const { comboKey, discovererName } = req.body as { comboKey?: unknown; discovererName?: unknown };
	if (!isValidComboKey(comboKey)) {
		res.status(400).json({ error: 'Invalid comboKey' });
		return;
	}
	if (typeof discovererName !== 'string' || discovererName.trim().length === 0) {
		res.status(400).json({ error: 'Invalid discovererName' });
		return;
	}
	const kv = await getKv();
	const payload: UnlockedComboEntry = { discovererName: discovererName.trim(), unlockedAt: Date.now() };
	const set = await kv.set(`combo:${comboKey}`, payload, { nx: true });
	res.json({ firstUnlock: set !== null });
});

app.get('/api/combos', async (_req, res) => {
	const kv = await getKv();
	const values = await kv.mget<(UnlockedComboEntry | null)[]>(...ALL_COMBO_KEYS);
	const unlocked: Record<string, UnlockedComboEntry> = {};
	for (let i = 0; i < ALL_COMBO_KEYS.length; i++) {
		const entry = values[i];
		if (entry !== null) unlocked[ALL_COMBO_KEYS[i].replace('combo:', '')] = entry;
	}
	res.json({ unlocked });
});

const PORT = Number(process.env.API_PORT ?? 3001);
app.listen(PORT, () => console.log(`[dev-api] http://localhost:${PORT}/api`));
