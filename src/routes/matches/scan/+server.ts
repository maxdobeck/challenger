import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanScoreCard } from '$lib/server/ai/scoreVision';
import { parseScoreText } from '$lib/server/ai/scoreTextParse';
import { isThrottled, recordScanEvent } from '$lib/server/scanThrottle';
import { isThrottledByCookie, recordScanInCookie } from '$lib/server/scanThrottleCookie';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const throttled = DEMO_MODE ? isThrottledByCookie(event.cookies) : await isThrottled(user.id);
	if (throttled) {
		error(429, "You've hit the 20-scans-per-day limit. Try again later.");
	}

	const formData = await event.request.formData();
	const image = formData.get('image');
	const text = formData.get('text')?.toString().trim();
	const hasImage = image instanceof Blob && image.size > 0;
	if (!hasImage && !text) {
		error(400, 'No image or text provided');
	}

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };

	const result = hasImage
		? await scanScoreCard(image as Blob, ldUser, profile)
		: await parseScoreText(text!, ldUser, profile);

	if (DEMO_MODE) {
		recordScanInCookie(event.cookies);
	} else {
		await recordScanEvent(user.id);
	}

	return json({ crit_op: result.crit, kill_op: result.kill, tac_op: result.tac });
};
