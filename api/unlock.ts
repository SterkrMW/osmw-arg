import { timingSafeEqual } from 'crypto';
import { getKv } from './_kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const COMBO_KEY_RE = /^[0-3]_[0-3]$/;
const MAX_NAME_LENGTH = 64;

function isValidComboKey(key: unknown): key is string {
	return typeof key === 'string' && COMBO_KEY_RE.test(key);
}

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

	const { comboKey, discovererName } = req.body as {
		comboKey?: unknown;
		discovererName?: unknown;
	};

	if (!isValidComboKey(comboKey)) {
		res.status(400).json({ error: 'Invalid comboKey' });
		return;
	}

	if (
		typeof discovererName !== 'string' ||
		discovererName.trim().length === 0 ||
		discovererName.length > MAX_NAME_LENGTH
	) {
		res.status(400).json({ error: 'Invalid discovererName' });
		return;
	}

	const kvKey = `combo:${comboKey}`;
	const payload = {
		discovererName: discovererName.trim(),
		unlockedAt: Date.now(),
	};

	// NX: only write if the key doesn't already exist — first discoverer wins atomically
	const kv = await getKv();
	const set = await kv.set(kvKey, payload, { nx: true });
	const firstUnlock = set !== null;

	res.status(200).json({ firstUnlock });
}
