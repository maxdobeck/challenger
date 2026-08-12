import { Redis } from '@upstash/redis';
import { env } from '$env/dynamic/private';

// Vercel's KV/Redis Marketplace integration provisions these two REST env vars
// (the same names @vercel/kv itself reads, since it's a thin wrapper over
// Upstash). When they're unset -- the state today -- everything here is a
// no-op and callers fall back to in-memory-only behavior, matching the
// "real if configured, mocked/local otherwise" seam used for the AI Config
// keys elsewhere in this codebase.
const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

export const isKvConfigured = redis !== null;

const EXTRA_MATCHES_KEY = 'demo:matches';
const NEXT_ID_KEY = 'demo:matches:next_id';
// Keeps KV-issued ids from colliding with the deterministic seeded ids (a few
// hundred at most), which are regenerated in-memory on every cold start.
const KV_ID_OFFSET = 1_000_000;

export async function nextKvMatchId(): Promise<number> {
	if (!redis) throw new Error('KV is not configured');
	const n = await redis.incr(NEXT_ID_KEY);
	return KV_ID_OFFSET + n;
}

export async function pushKvMatch(match: unknown): Promise<void> {
	if (!redis) return;
	await redis.rpush(EXTRA_MATCHES_KEY, JSON.stringify(match));
}

export async function getKvMatches<T>(): Promise<T[]> {
	if (!redis) return [];
	const raw = await redis.lrange<string>(EXTRA_MATCHES_KEY, 0, -1);
	return raw.map((entry) => (typeof entry === 'string' ? JSON.parse(entry) : entry) as T);
}
