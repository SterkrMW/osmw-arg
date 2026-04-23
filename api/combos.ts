import { getKv } from './_kv.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { UnlockedComboEntry } from '../src/types';

export type { UnlockedComboEntry };

const ALL_COMBO_KEYS = [0, 1, 2, 3].flatMap(r1 => [0, 1, 2, 3].map(r2 => `combo:${r1}_${r2}`));

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
	const kv = await getKv();
	const values = await kv.mget<UnlockedComboEntry>(...ALL_COMBO_KEYS);

	const unlocked: Record<string, UnlockedComboEntry> = {};
	for (let i = 0; i < ALL_COMBO_KEYS.length; i++) {
		const entry = values[i];
		if (entry !== null) {
			const comboKey = ALL_COMBO_KEYS[i].replace('combo:', '');
			unlocked[comboKey] = entry;
		}
	}

	res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate');
	res.status(200).json({ unlocked });
}
