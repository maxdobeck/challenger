import { db } from '$lib/server/db';
import { scanEvent } from '$lib/server/db/schema';
import { and, count, eq, gt, sql } from 'drizzle-orm';

// Real-DB-mode counterpart to demo mode's cookie-based throttle: both cap a user
// at this many score-scan attempts per rolling 24h window, just computed from a
// real per-user history here instead of a client-carried counter.
//
// Deliberately high enough that ordinary use -- and a full e2e run, which drives
// real turns through the same endpoint -- never reaches it. At 20 (and then at
// 100) a day's testing exhausted the budget, after which every scan came back
// 429; that surfaces as "you've hit today's scan limit" and is easy to mistake
// for a broken feature. This is a runaway-cost backstop, not a usage quota.
//
// e2e/quick-upload-chat.e2e.ts keeps a hand-synced copy of this value to seed
// its cap tests -- update both together.
export const SCAN_LIMIT_PER_DAY = 500;

export async function isThrottled(userId: string): Promise<boolean> {
	const rows = await db
		.select({ count: count() })
		.from(scanEvent)
		.where(and(eq(scanEvent.userId, userId), gt(scanEvent.createdAt, sql`now() - interval '24 hours'`)));
	return (rows[0]?.count ?? 0) >= SCAN_LIMIT_PER_DAY;
}

export async function recordScanEvent(userId: string): Promise<void> {
	await db.insert(scanEvent).values({ userId });
}
