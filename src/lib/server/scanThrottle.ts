import { db } from '$lib/server/db';
import { scanEvent } from '$lib/server/db/schema';
import { and, count, eq, gt, sql } from 'drizzle-orm';

// Real-DB-mode counterpart to demo mode's cookie-based throttle: both cap a user
// at this many score-scan attempts per rolling 24h window, just computed from a
// real per-user history here instead of a client-carried counter.
export const SCAN_LIMIT_PER_DAY = 20;

export async function isThrottled(userId: string): Promise<boolean> {
	const rows = await db
		.select({ count: count() })
		.from(scanEvent)
		.where(and(eq(scanEvent.userId, userId), gt(scanEvent.createdAt, sql`now() - interval '24 hours'`)));
	return (rows[0]?.count ?? 0) >= SCAN_LIMIT_PER_DAY;
}

// Returns the inserted row's id so callers can hand it back to the client for
// later feedback correlation (see $lib/server/ai/feedback.ts).
export async function recordScanEvent(userId: string, resumptionToken: string | null): Promise<number> {
	const [row] = await db
		.insert(scanEvent)
		.values({ userId, resumptionToken })
		.returning({ id: scanEvent.id });
	return row.id;
}

// Looks up the resumption token for a scan this user owns, so the feedback
// endpoint can reconstruct the original AI Config tracker rather than starting
// a fresh, uncorrelated run. Returns null if the scan doesn't exist, belongs to
// someone else, or has no token (e.g. LaunchDarkly wasn't configured at scan time).
export async function getScanEventResumptionToken(
	scanEventId: number,
	userId: string
): Promise<string | null> {
	const rows = await db
		.select({ resumptionToken: scanEvent.resumptionToken })
		.from(scanEvent)
		.where(and(eq(scanEvent.id, scanEventId), eq(scanEvent.userId, userId)))
		.limit(1);
	return rows[0]?.resumptionToken ?? null;
}
