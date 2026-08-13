import Anthropic from '@anthropic-ai/sdk';
import { LDFeedbackKind } from '@launchdarkly/server-sdk-ai';
import { env } from '$env/dynamic/private';
import { getAiClient } from './ldClient';
import { buildServerContext, type ServerLDUser, type ServerLDProfile } from './context';

export const SCORE_CHAT_CONFIG_KEY = 'score-chat';

// Matches the model the one-shot scan paths already use (scoreVision.ts /
// scoreTextParse.ts): cheap and fast, and this is the same structured
// extraction task, just spread across turns.
const DEFAULT_MODEL = 'claude-haiku-4-5';

const DEFAULT_PROMPT =
	'You are a friendly assistant helping a Kill Team player log a match score through ' +
	'conversation. Determine the Crit, Kill, and Tac op values (0-6 each) for both the player ' +
	"('you') and their opponent, from photos of score-tracker cards and/or natural-language " +
	'descriptions they share. Ask short, friendly follow-up questions one at a time until you ' +
	"know both sides -- don't guess. Once you know a side's Crit/Kill/Tac, ask which op they're " +
	'taking as Primary before treating that side as complete -- capture primaryOpChoice only ' +
	'from what the player actually tells you in this conversation, never inferred or guessed ' +
	"from a photo. Always call the tool with your reply and your current best understanding; " +
	"mark a side's reading unknown (known: false) until you actually have it. Never say the " +
	'match has been logged or saved -- you only gather the scores, and the player still has to ' +
	'confirm them and submit the form themselves.';

export type Category = 'crit' | 'kill' | 'tac';
const CATEGORIES: readonly Category[] = ['crit', 'kill', 'tac'];

export type ChatReading = {
	crit: number;
	kill: number;
	tac: number;
	primaryOpChoice: Category | null;
};

const READING_PROPERTIES = {
	known: {
		type: 'boolean',
		description:
			"True once you actually know this player's Crit/Kill/Tac from what they've described " +
			"or shown you -- false while it's still unknown."
	},
	crit: { type: 'integer', minimum: 0, maximum: 6, description: 'Crit value, 0-6' },
	kill: { type: 'integer', minimum: 0, maximum: 6, description: 'Kill value, 0-6' },
	tac: { type: 'integer', minimum: 0, maximum: 6, description: 'Tac value, 0-6' },
	primaryOpChoice: {
		type: 'string',
		enum: ['crit', 'kill', 'tac'],
		description:
			'Which op this player is taking as Primary. Only set this once they have actually told ' +
			'you (in their own words, or in answer to your question) -- never guess or infer it ' +
			'from a photo.'
	}
};

// The tool stays *forced* every turn, exactly as the one-shot scan paths do --
// that's what makes the structured extraction reliable. Carrying the
// conversational `reply` inside the tool call is what lets a forced call still
// ask a follow-up question instead of only ever reporting a finished reading.
const SCORE_CHAT_TOOL = {
	name: 'update_score_chat',
	description: "Reply to the user and report your current best understanding of both players' scores.",
	input_schema: {
		type: 'object',
		properties: {
			reply: {
				type: 'string',
				description:
					'Your natural-language reply to the user -- e.g. a follow-up question or an ' +
					'acknowledgement.'
			},
			you: { type: 'object', properties: READING_PROPERTIES, required: ['known', 'crit', 'kill', 'tac'] },
			opponent: {
				type: 'object',
				properties: READING_PROPERTIES,
				required: ['known', 'crit', 'kill', 'tac']
			}
		},
		required: ['reply', 'you', 'opponent']
	}
} satisfies Anthropic.Tool;

function parseCategory(value: unknown): Category | null {
	return typeof value === 'string' && CATEGORIES.includes(value as Category)
		? (value as Category)
		: null;
}

// Op values are clamped rather than rejected: a model that returns 7 has still
// told us something useful, and the match form only accepts 0-6 anyway. A
// side that isn't known yet (or came back malformed) collapses to null so the
// client can keep treating it as outstanding.
export function parseReading(raw: unknown): ChatReading | null {
	if (!raw || typeof raw !== 'object') return null;
	const reading = raw as Record<string, unknown>;
	if (!reading.known) return null;

	const values = CATEGORIES.map((key) => reading[key]);
	if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;

	const [crit, kill, tac] = values.map((value) =>
		Math.min(6, Math.max(0, Math.round(value as number)))
	);
	return { crit, kill, tac, primaryOpChoice: parseCategory(reading.primaryOpChoice) };
}

export type ScoreChatTurnResult = {
	reply: string;
	you: ChatReading | null;
	opponent: ChatReading | null;
	history: Anthropic.Messages.MessageParam[];
	resumptionToken: string | null;
};

// Once the model has read a photo and extracted its numbers, the raw bytes are
// dead weight in a history that gets resent on every subsequent turn. Swapping
// them for a text marker keeps the memory that a photo was shown without
// paying to re-upload it for the rest of the conversation.
const PHOTO_PLACEHOLDER = '[photo of a score tracker — already read]';

function stripImages(
	message: Anthropic.Messages.MessageParam
): Anthropic.Messages.MessageParam {
	if (typeof message.content === 'string') return message;
	return {
		...message,
		content: message.content.map((block) =>
			block.type === 'image' ? { type: 'text' as const, text: PHOTO_PLACEHOLDER } : block
		)
	};
}

// The browser round-trips this history back to us on every turn, so it is
// attacker-controlled input like any other form field -- never trusted to be
// well-formed, and never trusted to be the same history we handed out.
export const MAX_HISTORY_CHARS = 256 * 1024;
const MAX_HISTORY_MESSAGES = 60;

function isMessageParam(value: unknown): value is Anthropic.Messages.MessageParam {
	if (!value || typeof value !== 'object') return false;
	const message = value as Record<string, unknown>;
	if (message.role !== 'user' && message.role !== 'assistant') return false;
	if (typeof message.content === 'string') return message.content.length > 0;
	return Array.isArray(message.content) && message.content.length > 0;
}

function isToolResultTurn(message: Anthropic.Messages.MessageParam): boolean {
	return (
		Array.isArray(message.content) && message.content.some((block) => block.type === 'tool_result')
	);
}

/**
 * Coerces client-supplied history into something safe to send to Anthropic.
 *
 * Drops anything that isn't a well-formed message, strips image blocks (we
 * replaced every image we've seen with a placeholder before handing history
 * back, so an image here is a replay or an injection -- and re-uploading bytes
 * is exactly the cost this design avoids), and caps the length. Trimming the
 * head can orphan a tool_result whose tool_use is now gone, which Anthropic
 * rejects, so the trimmed history is realigned to start on a real user turn.
 */
export function sanitizeHistory(raw: unknown): Anthropic.Messages.MessageParam[] {
	if (!Array.isArray(raw)) return [];

	const messages = raw.filter(isMessageParam).map(stripImages).slice(-MAX_HISTORY_MESSAGES);
	const start = messages.findIndex(
		(message) => message.role === 'user' && !isToolResultTurn(message)
	);
	return start === -1 ? [] : messages.slice(start);
}

function mockReading(): ChatReading {
	const roll = () => Math.floor(Math.random() * 7);
	return { crit: roll(), kill: roll(), tac: roll(), primaryOpChoice: 'crit' };
}

/**
 * Runs one turn of the Quick Upload score conversation.
 *
 * `history` is whatever the client handed back from the previous turn -- the
 * browser stores it verbatim and never interprets it. Each turn appends the
 * assistant's response *and* a synthetic tool_result, because Anthropic
 * requires every tool_use block to be answered before the conversation can
 * continue; returning an already-valid array is what makes the client's
 * resend-as-is contract work.
 */
export async function runScoreChatTurn(
	history: Anthropic.Messages.MessageParam[],
	newUserContent: Anthropic.Messages.MessageParam['content'],
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreChatTurnResult> {
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	// Agent mode (rather than the completion mode the one-shot scans use):
	// this is a single conversational agent with standing instructions, which
	// is what `instructions` models, not a per-call prompt template.
	const aiConfig = aiClient
		? await aiClient.agentConfig(SCORE_CHAT_CONFIG_KEY, context, {
				model: { name: DEFAULT_MODEL },
				instructions: DEFAULT_PROMPT
			})
		: null;
	const tracker = aiConfig?.createTracker();
	const newUserMessage: Anthropic.Messages.MessageParam = { role: 'user', content: newUserContent };

	if (!env.ANTHROPIC_API_KEY) {
		tracker?.trackSuccess();
		const reply = 'Logging a mock reading — no Anthropic API key is configured.';
		return {
			reply,
			you: mockReading(),
			opponent: mockReading(),
			// A synthetic assistant turn keeps the history well-formed, so a
			// conversation started without a key still resends cleanly if one
			// gets configured mid-session.
			history: [...history, stripImages(newUserMessage), { role: 'assistant', content: reply }],
			resumptionToken: tracker?.resumptionToken ?? null
		};
	}

	const modelName = aiConfig?.model?.name ?? DEFAULT_MODEL;
	const systemPrompt = aiConfig?.instructions ?? DEFAULT_PROMPT;
	const messages = [...history, newUserMessage];

	try {
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const start = Date.now();
		const response = await anthropic.messages.create({
			model: modelName,
			// Roomier than the one-shot scans' 256: replies now carry real
			// conversational text alongside the structured reading.
			max_tokens: 512,
			system: systemPrompt,
			tools: [SCORE_CHAT_TOOL],
			tool_choice: { type: 'tool', name: SCORE_CHAT_TOOL.name },
			messages
		});
		tracker?.trackDuration(Date.now() - start);
		tracker?.trackTokens({
			total: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
			input: response.usage?.input_tokens ?? 0,
			output: response.usage?.output_tokens ?? 0
		});

		const toolUse = response.content.find((block) => block.type === 'tool_use');
		if (toolUse?.type !== 'tool_use') {
			throw new Error('Model did not return a structured reply.');
		}
		const input = toolUse.input as Record<string, unknown>;
		const reply = typeof input.reply === 'string' ? input.reply : '';
		if (!reply) {
			throw new Error('Model did not return a reply.');
		}

		tracker?.trackSuccess();
		return {
			reply,
			you: parseReading(input.you),
			opponent: parseReading(input.opponent),
			history: [
				...history,
				stripImages(newUserMessage),
				{ role: 'assistant', content: response.content },
				{ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'ok' }] }
			],
			resumptionToken: tracker?.resumptionToken ?? null
		};
	} catch (err) {
		tracker?.trackError();
		throw err;
	}
}

/**
 * Attaches a thumbs-up/down to an earlier run. The resumption token encodes
 * that run's runId, so the feedback event correlates with it in LaunchDarkly's
 * metrics view even though this is a separate request. No-ops when
 * LaunchDarkly isn't configured -- there's no run to attach anything to.
 */
export async function submitScoreFeedback(
	resumptionToken: string,
	kind: 'positive' | 'negative',
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<boolean> {
	const aiClient = await getAiClient();
	if (!aiClient) return false;

	const tracker = aiClient.createTracker(resumptionToken, buildServerContext(user, profile));
	tracker.trackFeedback({
		kind: kind === 'positive' ? LDFeedbackKind.Positive : LDFeedbackKind.Negative
	});
	return true;
}
