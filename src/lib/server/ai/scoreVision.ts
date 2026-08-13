import { runScoreCompletion, type ScoreScanResult } from './shared';
import type { ServerLDUser, ServerLDProfile } from './context';

export const SCORE_PHOTO_SCAN_CONFIG_KEY = 'score-photo-scan';

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_MEDIA_TYPES: readonly SupportedMediaType[] = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp'
];

// The client always sends image/jpeg post-downscale (see $lib/imageDownscale);
// fall back to it for any missing/unrecognized type (e.g. a direct API
// bypass) rather than mislabeling arbitrary bytes as PNG.
export function resolveMediaType(blob: Blob): SupportedMediaType {
	return SUPPORTED_MEDIA_TYPES.includes(blob.type as SupportedMediaType)
		? (blob.type as SupportedMediaType)
		: 'image/jpeg';
}

// claude-haiku-4-5: cheap/fast, proven sufficient for this structured
// extraction task by the original direct-Anthropic implementation (97b44e9).
const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_PROMPT =
	'You are reading a Kill Team turn-tracker card from a photo. The card has five magnets ' +
	'sliding along labeled scales: KILL OP, CRIT OP, TAC OP, CP, and Turning Point. Read the ' +
	'magnet position on each scale and report CRIT OP, KILL OP, and TAC OP as integers 0-6. ' +
	'Respond with strict JSON only: {"crit": n, "kill": n, "tac": n}.';

export async function scanScoreCard(
	imageBlob: Blob,
	user: ServerLDUser,
	profile: ServerLDProfile,
	requestHeaders?: Headers
): Promise<ScoreScanResult> {
	const imageBase64 = Buffer.from(await imageBlob.arrayBuffer()).toString('base64');
	return runScoreCompletion(
		SCORE_PHOTO_SCAN_CONFIG_KEY,
		DEFAULT_MODEL,
		DEFAULT_PROMPT,
		[
			{ type: 'image', image: imageBase64, mediaType: resolveMediaType(imageBlob) },
			{ type: 'text', text: 'Read the score tracker card in this photo.' }
		],
		user,
		profile,
		requestHeaders
	);
}
