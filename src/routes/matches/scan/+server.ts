import { error, json } from '@sveltejs/kit';
import { and, count, eq, gte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { scoreScan } from '$lib/server/db/schema';
import { countRecentDemoScans, recordDemoScan } from '$lib/server/demo/data';
import { scanScoreboardImage, type ScoreboardReading } from '$lib/server/anthropic';

const DEMO_MODE = env.DEMO_MODE === 'true';
const DAILY_SCAN_LIMIT = 20;
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Demo mode never spends a real API call — deterministic, offline, and keeps
// `npm run dev:demo` working with no ANTHROPIC_API_KEY configured.
function mockScanResult(): ScoreboardReading {
	const roll = () => Math.floor(Math.random() * 7);
	return { crit_op: roll(), kill_op: roll(), tac_op: roll() };
}

async function recentScanCount(userId: string): Promise<number> {
	if (DEMO_MODE) return countRecentDemoScans(userId);

	const cutoff = new Date(Date.now() - SCAN_WINDOW_MS);
	const [row] = await db
		.select({ value: count() })
		.from(scoreScan)
		.where(and(eq(scoreScan.userId, userId), gte(scoreScan.createdAt, cutoff)));
	return row?.value ?? 0;
}

async function logScan(userId: string, result: ScoreboardReading | null): Promise<void> {
	const status = result ? 'success' : 'error';
	if (DEMO_MODE) {
		recordDemoScan(userId, status);
		return;
	}
	await db.insert(scoreScan).values({
		userId,
		status,
		critOp: result?.crit_op ?? null,
		killOp: result?.kill_op ?? null,
		tacOp: result?.tac_op ?? null
	});
}

export const POST: RequestHandler = async (event) => {
	const currentUser = event.locals.user;
	if (!currentUser) {
		error(401, 'Not logged in');
	}

	if ((await recentScanCount(currentUser.id)) >= DAILY_SCAN_LIMIT) {
		error(429, 'Daily scan limit reached — enter these scores manually.');
	}

	const formData = await event.request.formData();
	const image = formData.get('image');
	if (!(image instanceof Blob) || image.size === 0) {
		error(400, 'No image provided');
	}
	if (image.size > MAX_IMAGE_BYTES) {
		error(400, 'Image is too large.');
	}

	if (DEMO_MODE) {
		const result = mockScanResult();
		await logScan(currentUser.id, result);
		return json(result);
	}

	const base64 = Buffer.from(await image.arrayBuffer()).toString('base64');

	let result: ScoreboardReading;
	try {
		result = await scanScoreboardImage(base64);
	} catch (err) {
		await logScan(currentUser.id, null);
		console.error('Score scan failed', err);
		error(502, 'Could not read the screenshot. Try again or enter scores manually.');
	}

	await logScan(currentUser.id, result);
	return json(result);
};
