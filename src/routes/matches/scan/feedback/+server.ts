import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { submitScoreFeedback } from '$lib/server/ai/shared';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';

// No throttle check here -- unlike /matches/scan, giving feedback on an
// existing reading isn't a model call, so it doesn't cost against the daily
// scan cap.
export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const body = await event.request.json();
	const resumptionToken = typeof body.resumption_token === 'string' ? body.resumption_token : null;
	const kind = body.kind;
	if (kind !== 'positive' && kind !== 'negative') {
		error(400, 'Invalid feedback kind');
	}

	// A null token means LaunchDarkly wasn't configured for the original scan
	// (or the client never received one) -- not an error, just nothing to
	// attach feedback to.
	if (!resumptionToken) {
		return json({ ok: true, recorded: false });
	}

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };
	try {
		await submitScoreFeedback(resumptionToken, kind, ldUser, profile);
	} catch (err) {
		// A malformed or expired token shouldn't surface as a hard failure to
		// the user -- their feedback click still "worked" from their
		// perspective, it just didn't reach LaunchDarkly.
		console.error('Score feedback failed', err);
		return json({ ok: true, recorded: false });
	}
	return json({ ok: true, recorded: true });
};
