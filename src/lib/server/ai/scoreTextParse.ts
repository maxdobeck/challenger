import { runScoreCompletion, type ScoreScanResult } from './shared';
import type { ServerLDUser, ServerLDProfile } from './context';

export const SCORE_TEXT_PARSE_CONFIG_KEY = 'score-text-parse';

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_PROMPT =
	'Parse a player\'s natural-language description of their Kill Team score into CRIT OP, ' +
	'KILL OP, and TAC OP as integers 0-6. Respond with strict JSON only: ' +
	'{"crit": n, "kill": n, "tac": n}.';

export async function parseScoreText(
	text: string,
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanResult> {
	return runScoreCompletion(SCORE_TEXT_PARSE_CONFIG_KEY, DEFAULT_MODEL, DEFAULT_PROMPT, text, user, profile);
}
