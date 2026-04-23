import { timingSafeEqual } from 'crypto';
import { getKv } from './_kv.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALL_COMBO_KEYS = [0, 1, 2, 3].flatMap(r1 => [0, 1, 2, 3].map(r2 => `combo:${r1}_${r2}`));

function isAuthorized(header: string | string[] | undefined, expected: string): boolean {
	const value = Array.isArray(header) ? header[0] : header;
	if (!value || value.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
	if (req.method !== 'POST') {
		res.status(405).json({ error: 'Method not allowed' });
		return;
	}

	const expectedKey = process.env.COMBO_UNLOCK_API_KEY ?? '';
	if (!isAuthorized(req.headers['x-api-key'], expectedKey)) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}

	const kv = await getKv();
	const deleted = await kv.del(...ALL_COMBO_KEYS);

	res.status(200).json({ deleted });
}
