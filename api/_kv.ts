import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export interface KvStore {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, options?: { nx?: boolean }): Promise<'OK' | null>;
	mget<T>(...keys: string[]): Promise<(T | null)[]>;
	del(...keys: string[]): Promise<number>;
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

	public async del(...keys: string[]): Promise<number> {
		let count = 0;
		for (const k of keys) {
			if (this.store.delete(k)) count++;
		}
		return count;
	}
}

class RedisKv implements KvStore {
	constructor(private readonly client: RedisClient) {}

	public async get<T>(key: string): Promise<T | null> {
		const val = await this.client.get(key);
		return val === null ? null : (JSON.parse(val) as T);
	}

	public async set<T>(key: string, value: T, options?: { nx?: boolean }): Promise<'OK' | null> {
		const result = await this.client.set(key, JSON.stringify(value), options?.nx ? { NX: true } : undefined);
		return (result as 'OK') ?? null;
	}

	public async mget<T>(...keys: string[]): Promise<(T | null)[]> {
		const vals = await this.client.mGet(keys);
		return vals.map(v => (v === null ? null : (JSON.parse(v) as T)));
	}

	public async del(...keys: string[]): Promise<number> {
		return this.client.del(keys);
	}
}

async function makeKv(): Promise<KvStore> {
	if (process.env.REDIS_URL) {
		const client = createClient({ url: process.env.REDIS_URL });
		await client.connect();
		return new RedisKv(client);
	}
	console.log('[kv] No REDIS_URL — using in-memory store (local dev only)');
	return new InMemoryKv();
}

let _kvPromise: Promise<KvStore> | null = null;
export function getKv(): Promise<KvStore> {
	if (!_kvPromise) _kvPromise = makeKv();
	return _kvPromise;
}
