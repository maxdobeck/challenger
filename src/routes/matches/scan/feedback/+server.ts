import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { submitScoreFeedback } from '$lib/server/ai/scoreChat';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';

// No throttle check here, unlike the scan/chat routes: recording a thumbs-up
// isn't a model call, so it costs nothing worth capping.
export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const body = await event.request.json().catch(() => null);
	const kind = body?.kind;
	if (kind !== 'positive' && kind !== 'negative') {
		error(400, 'Invalid feedback kind');
	}

	const token = body?.resumption_token;
	// A missing token means LaunchDarkly isn't configured (so no run exists to
	// attach this to) rather than a client error -- the UI still acknowledges
	// the user either way, so report it as a non-failure.
	if (typeof token !== 'string' || !token) {
		return json({ ok: true, recorded: false });
	}

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };

	try {
		const recorded = await submitScoreFeedback(token, kind, ldUser, profile);
		return json({ ok: true, recorded });
	} catch (err) {
		// Feedback is a nice-to-have signal; a tracking failure should never
		// surface to someone who just clicked a thumbs-up.
		console.error('Score feedback failed', err);
		return json({ ok: true, recorded: false });
	}
};
