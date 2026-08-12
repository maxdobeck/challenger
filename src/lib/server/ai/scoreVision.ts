import { runScoreCompletion, type ScoreScanResult } from './shared';
import type { ServerLDUser, ServerLDProfile } from './context';

export const SCORE_PHOTO_SCAN_CONFIG_KEY = 'score-photo-scan';

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_PROMPT =
	'You are reading a Kill Team turn-tracker card from a photo. The card has five magnets ' +
	'sliding along labeled scales: KILL OP, CRIT OP, TAC OP, CP, and Turning Point. Read the ' +
	'magnet position on each scale and report CRIT OP, KILL OP, and TAC OP as integers 0-6. ' +
	'Respond with strict JSON only: {"crit": n, "kill": n, "tac": n}.';

export async function scanScoreCard(
	imageBlob: Blob,
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanResult> {
	const imageBase64 = Buffer.from(await imageBlob.arrayBuffer()).toString('base64');
	return runScoreCompletion(
		SCORE_PHOTO_SCAN_CONFIG_KEY,
		DEFAULT_MODEL,
		DEFAULT_PROMPT,
		[
			{
				type: 'image',
				source: { type: 'base64', media_type: 'image/png', data: imageBase64 }
			},
			{ type: 'text', text: 'Read the score tracker card in this photo.' }
		],
		user,
		profile
	);
}
