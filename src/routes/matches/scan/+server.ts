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

// Anthropic's Vision API hard-caps images at 5MB *base64-encoded*, and
// base64 inflates raw bytes by 4/3 -- so raw bytes must stay under
// ~3.75MiB (5MB * 3/4) to have any chance of reaching the model at all.
// 3MiB leaves ~1MiB/20% headroom under that ceiling, while still being
// 3-10x larger than a legitimately downscaled upload ($lib/imageDownscale
// targets ~1568px long edge / JPEG q0.85, typically a few hundred KB) --
// this should now only ever fire for a client bypass, not real traffic,
// and fails fast with a clear message instead of a confusing 502 from
// Anthropic itself.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

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
			? await scanScoreCard(image as Blob, ldUser, profile, event.request.headers)
			: await parseScoreText(text!, ldUser, profile, event.request.headers);
	} catch (err) {
		await recordAttempt(user.id, event.cookies);
		console.error('Score scan failed', err);
		error(502, 'Could not read that. Try again or enter scores manually.');
	}

	await recordAttempt(user.id, event.cookies);
	return json({ crit_op: result.crit, kill_op: result.kill, tac_op: result.tac });
};
