import { error, json, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanScoreCard, SCORE_PHOTO_SCAN_CONFIG_KEY } from '$lib/server/ai/scoreVision';
import { parseScoreText, SCORE_TEXT_PARSE_CONFIG_KEY } from '$lib/server/ai/scoreTextParse';
import type { ScoreScanResult } from '$lib/server/ai/shared';
import { isThrottled, recordScanEvent } from '$lib/server/scanThrottle';
import { isThrottledByCookie, recordScanInCookie } from '$lib/server/scanThrottleCookie';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Records the attempt against the daily cap regardless of outcome -- a failed
// scan still cost a model call (or would have, once real keys are set), so
// letting failures go uncounted would let someone dodge the limit by forcing
// errors. Returns the scan_event row id in real-DB mode (null in demo mode, and
// on the error path where there's no resumption token to store) so the client
// can reference this exact scan when submitting feedback.
async function recordAttempt(
	userId: string,
	cookies: Cookies,
	resumptionToken: string | null
): Promise<number | null> {
	if (DEMO_MODE) {
		recordScanInCookie(cookies);
		return null;
	}
	return await recordScanEvent(userId, resumptionToken);
}

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const throttled = DEMO_MODE ? isThrottledByCookie(event.cookies) : await isThrottled(user.id);
	if (throttled) {
		error(429, "You've hit today's scan limit — enter these scores manually.");
	}

	const formData = await event.request.formData();
	const image = formData.get('image');
	const text = formData.get('text')?.toString().trim();
	const hasImage = image instanceof Blob && image.size > 0;
	if (!hasImage && !text) {
		error(400, 'No image or text provided');
	}
	if (hasImage && (image as Blob).size > MAX_IMAGE_BYTES) {
		error(400, 'Image is too large.');
	}

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };
	const aiConfigKey = hasImage ? SCORE_PHOTO_SCAN_CONFIG_KEY : SCORE_TEXT_PARSE_CONFIG_KEY;

	let result: ScoreScanResult;
	let resumptionToken: string | null;
	try {
		const outcome = hasImage
			? await scanScoreCard(image as Blob, ldUser, profile)
			: await parseScoreText(text!, ldUser, profile);
		result = outcome.result;
		resumptionToken = outcome.resumptionToken;
	} catch (err) {
		await recordAttempt(user.id, event.cookies, null);
		console.error('Score scan failed', err);
		error(502, 'Could not read that. Try again or enter scores manually.');
	}

	const scanEventId = await recordAttempt(user.id, event.cookies, resumptionToken);
	return json({
		crit_op: result.crit,
		kill_op: result.kill,
		tac_op: result.tac,
		scan_event_id: scanEventId,
		ai_config_key: aiConfigKey
	});
};
