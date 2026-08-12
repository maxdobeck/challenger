import { error, json, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanScoreCard } from '$lib/server/ai/scoreVision';
import { parseScoreText, correctScoreReading } from '$lib/server/ai/scoreTextParse';
import type { ScoreScanTurnResult } from '$lib/server/ai/shared';
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
	const mode = formData.get('mode')?.toString() ?? 'scan';

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };

	let turnResult: ScoreScanTurnResult;
	if (mode === 'correct') {
		const priorCrit = Number(formData.get('prior_crit'));
		const priorKill = Number(formData.get('prior_kill'));
		const priorTac = Number(formData.get('prior_tac'));
		const correctionText = formData.get('correction_text')?.toString().trim();
		if (
			!correctionText ||
			!Number.isFinite(priorCrit) ||
			!Number.isFinite(priorKill) ||
			!Number.isFinite(priorTac)
		) {
			error(400, 'Missing prior reading or correction text');
		}

		try {
			turnResult = await correctScoreReading(
				{ crit: priorCrit, kill: priorKill, tac: priorTac },
				correctionText,
				ldUser,
				profile
			);
		} catch (err) {
			await recordAttempt(user.id, event.cookies);
			console.error('Score correction failed', err);
			error(502, 'Could not read that. Try again or enter scores manually.');
		}
	} else {
		const image = formData.get('image');
		const text = formData.get('text')?.toString().trim();
		const hasImage = image instanceof Blob && image.size > 0;
		if (!hasImage && !text) {
			error(400, 'No image or text provided');
		}
		if (hasImage && (image as Blob).size > MAX_IMAGE_BYTES) {
			error(400, 'Image is too large.');
		}

		try {
			turnResult = hasImage
				? await scanScoreCard(image as Blob, ldUser, profile)
				: await parseScoreText(text!, ldUser, profile);
		} catch (err) {
			await recordAttempt(user.id, event.cookies);
			console.error('Score scan failed', err);
			error(502, 'Could not read that. Try again or enter scores manually.');
		}
	}

	await recordAttempt(user.id, event.cookies);
	const { result, resumptionToken } = turnResult;
	return json({
		crit_op: result.crit,
		kill_op: result.kill,
		tac_op: result.tac,
		resumption_token: resumptionToken
	});
};
