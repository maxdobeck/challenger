import { db } from '$lib/server/db';
import { scanEvent } from '$lib/server/db/schema';
import { and, count, eq, gt, sql } from 'drizzle-orm';

// Real-DB-mode counterpart to demo mode's cookie-based throttle: both cap a user
// at this many score-scan attempts per rolling 24h window, just computed from a
// real per-user history here instead of a client-carried counter.
export const SCAN_LIMIT_PER_DAY = 100;

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
