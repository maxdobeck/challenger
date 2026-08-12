import { LDFeedbackKind } from '@launchdarkly/server-sdk-ai';
import { getAiClient, trackEvent } from './ldClient';
import { buildServerContext, type ServerLDUser, type ServerLDProfile } from './context';
import { SCORE_PHOTO_SCAN_CONFIG_KEY, DEFAULT_MODEL as VISION_MODEL, DEFAULT_PROMPT as VISION_PROMPT } from './scoreVision';
import {
	SCORE_TEXT_PARSE_CONFIG_KEY,
	DEFAULT_MODEL as TEXT_MODEL,
	DEFAULT_PROMPT as TEXT_PROMPT
} from './scoreTextParse';

export type FeedbackKind = 'positive' | 'negative';
export type ScoreCorrection = { crit: number; kill: number; tac: number };

// Defaults needed to re-resolve a completion config when no resumption token is
// available (e.g. demo mode, or a scan made before LaunchDarkly was configured).
const DEFAULTS_BY_CONFIG_KEY: Record<string, { model: string; prompt: string }> = {
	[SCORE_PHOTO_SCAN_CONFIG_KEY]: { model: VISION_MODEL, prompt: VISION_PROMPT },
	[SCORE_TEXT_PARSE_CONFIG_KEY]: { model: TEXT_MODEL, prompt: TEXT_PROMPT }
};

// Records a thumbs up/down against the AI run that produced a score reading.
// When `resumptionToken` is available (real-DB mode, LD configured at scan
// time) the feedback attaches to that exact run via
// LDAIClient.createTracker(token, context) -- LD's documented mechanism for
// "associating deferred events (such as user feedback) with the original
// tracker's runId". Otherwise this falls back to re-resolving the config fresh,
// which still lands feedback on the right AI Config + variation, just as a new,
// uncorrelated run.
export async function trackScoreFeedback(
	aiConfigKey: string,
	resumptionToken: string | null,
	kind: FeedbackKind,
	user: ServerLDUser,
	profile: ServerLDProfile,
	correction?: ScoreCorrection
): Promise<void> {
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	if (aiClient) {
		const tracker = resumptionToken
			? aiClient.createTracker(resumptionToken, context)
			: await (async () => {
					const defaults = DEFAULTS_BY_CONFIG_KEY[aiConfigKey];
					const aiConfig = defaults
						? await aiClient.completionConfig(aiConfigKey, context, {
								model: { name: defaults.model },
								messages: [{ role: 'system', content: defaults.prompt }]
							})
						: null;
					return aiConfig?.createTracker();
				})();

		tracker?.trackFeedback({
			kind: kind === 'positive' ? LDFeedbackKind.Positive : LDFeedbackKind.Negative
		});
	}

	if (correction) {
		await trackEvent('score-correction', context, { aiConfigKey, ...correction });
	}
}
