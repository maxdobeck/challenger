import { error, json, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanScoreCard } from '$lib/server/ai/scoreVision';
import { parseScoreText } from '$lib/server/ai/scoreTextParse';
import type { ScoreScanResult } from '$lib/server/ai/shared';
import { isThrottled, recordScanEvent } from '$lib/server/scanThrottle';
import { isThrottledByCookie, recordScanInCookie } from '$lib/server/scanThrottleCookie';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Records the attempt against the daily cap regardless of outcome -- a failed
// scan still cost a model call (or would have, once real keys are set), so
// letting failures go uncounted would let someone dodge the limit by forcing
// errors.
async function recordAttempt(userId: string, cookies: Cookies): Promise<void> {
	if (DEMO_MODE) {
		recordScanInCookie(cookies);
	} else {
		await recordScanEvent(userId);
	}
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

	let result: ScoreScanResult;
	try {
		result = hasImage
			? await scanScoreCard(image as Blob, ldUser, profile)
			: await parseScoreText(text!, ldUser, profile);
	} catch (err) {
		await recordAttempt(user.id, event.cookies);
		console.error('Score scan failed', err);
		error(502, 'Could not read that. Try again or enter scores manually.');
	}

	await recordAttempt(user.id, event.cookies);
	return json({ crit_op: result.crit, kill_op: result.kill, tac_op: result.tac });
};
