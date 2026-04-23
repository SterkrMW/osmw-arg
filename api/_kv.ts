/**
 * KV abstraction. In production (Vercel), delegates to @vercel/kv backed by
 * Upstash Redis. Locally (no KV_REST_API_URL), uses an in-memory Map so that
 * `vercel dev` works with no external services.
 *
 * The in-memory store persists for the lifetime of the dev process — enough to
 * test the full unlock + display flow in a single session.
 */

export interface KvStore {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, options?: { nx?: boolean }): Promise<'OK' | null>;
	mget<T>(...keys: string[]): Promise<(T | null)[]>;
}

class InMemoryKv implements KvStore {
	private readonly store = new Map<string, unknown>();

	public async get<T>(key: string): Promise<T | null> {
		return (this.store.get(key) as T) ?? null;
	}

	public async set<T>(key: string, value: T, options?: { nx?: boolean }): Promise<'OK' | null> {
		if (options?.nx && this.store.has(key)) return null;
		this.store.set(key, value);
		return 'OK';
	}

	public async mget<T>(...keys: string[]): Promise<(T | null)[]> {
		return keys.map(k => (this.store.get(k) as T) ?? null);
	}
}

async function makeKv(): Promise<KvStore> {
	if (process.env.KV_REST_API_URL) {
		const { kv } = await import('@vercel/kv');
		return kv as unknown as KvStore;
	}
	console.log('[kv] No KV_REST_API_URL — using in-memory store (local dev only)');
	return new InMemoryKv();
}

// Promise singleton — concurrent callers await the same init, preventing double-construction
let _kvPromise: Promise<KvStore> | null = null;
export function getKv(): Promise<KvStore> {
	if (!_kvPromise) _kvPromise = makeKv();
	return _kvPromise;
}
