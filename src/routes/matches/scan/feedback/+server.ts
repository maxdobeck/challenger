import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { trackScoreFeedback, type FeedbackKind } from '$lib/server/ai/feedback';
import { SCORE_PHOTO_SCAN_CONFIG_KEY } from '$lib/server/ai/scoreVision';
import { SCORE_TEXT_PARSE_CONFIG_KEY } from '$lib/server/ai/scoreTextParse';
import { getScanEventResumptionToken } from '$lib/server/scanThrottle';
import { db } from '$lib/server/db';
import { scanFeedback } from '$lib/server/db/schema';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';
const VALID_CONFIG_KEYS = new Set<string>([SCORE_PHOTO_SCAN_CONFIG_KEY, SCORE_TEXT_PARSE_CONFIG_KEY]);
const MAX_COMMENT_LENGTH = 1000;

// Returns the clamped integer 0-6, or null when the value wasn't a usable score.
function parseScoreValue(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) return null;
	return value;
}

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		error(400, 'Invalid request body');
	}

	const { scanEventId, aiConfigKey, kind, comment, correctedCrit, correctedKill, correctedTac } =
		body as Record<string, unknown>;

	if (typeof aiConfigKey !== 'string' || !VALID_CONFIG_KEYS.has(aiConfigKey)) {
		error(400, 'Unknown AI Config key');
	}
	if (kind !== 'positive' && kind !== 'negative') {
		error(400, 'Invalid feedback kind');
	}

	const trimmedComment =
		typeof comment === 'string' ? comment.trim().slice(0, MAX_COMMENT_LENGTH) || null : null;
	const crit = parseScoreValue(correctedCrit);
	const kill = parseScoreValue(correctedKill);
	const tac = parseScoreValue(correctedTac);
	const hasCorrection = crit !== null && kill !== null && tac !== null;
	const validScanEventId = typeof scanEventId === 'number' ? scanEventId : null;

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };

	const resumptionToken =
		!DEMO_MODE && validScanEventId !== null
			? await getScanEventResumptionToken(validScanEventId, user.id)
			: null;

	await trackScoreFeedback(
		aiConfigKey,
		resumptionToken,
		kind as FeedbackKind,
		ldUser,
		profile,
		hasCorrection ? { crit: crit!, kill: kill!, tac: tac! } : undefined
	);

	if (!DEMO_MODE) {
		await db.insert(scanFeedback).values({
			scanEventId: validScanEventId,
			userId: user.id,
			aiConfigKey,
			kind,
			comment: trimmedComment,
			correctedCrit: crit,
			correctedKill: kill,
			correctedTac: tac
		});
	}

	return json({ ok: true });
};
