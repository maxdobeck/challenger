import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// TODO: replace with a real Anthropic vision call reading CRIT/KILL/TAC off
// the uploaded photo. Mocked for now with randomized-but-plausible values so
// the scan-and-apply flow can be exercised end to end without an
// ANTHROPIC_API_KEY. The e2e suite (e2e/ai-score-scan.e2e.ts) never reaches
// this handler -- it intercepts the request in the browser -- but real
// manual use of "Log a Match" does hit this stub.
function mockScanResult() {
	const roll = () => Math.floor(Math.random() * 7);
	return { crit_op: roll(), kill_op: roll(), tac_op: roll() };
}

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) {
		error(401, 'Not logged in');
	}

	const formData = await event.request.formData();
	const image = formData.get('image');
	if (!(image instanceof Blob) || image.size === 0) {
		error(400, 'No image provided');
	}

	return json(mockScanResult());
};
