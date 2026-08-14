import { createAnthropic } from '@ai-sdk/anthropic';
import {
	generateText,
	jsonSchema,
	tool,
	type JSONSchema7,
	type ModelMessage,
	type UserContent
} from 'ai';
import { getAIMetricsFromResponse } from '@launchdarkly/server-sdk-ai-vercel';
import {
	LDFeedbackKind,
	type LDAIClient,
	type LDAIConfigTracker,
	type LDJudge,
	type LDMessage
} from '@launchdarkly/server-sdk-ai';
import type { LDContext } from '@launchdarkly/node-server-sdk';
import { env } from '$env/dynamic/private';
import { getAiClient, withLlmSpan, flushLdTelemetry } from './ldClient';
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

const READING_PROPERTIES: Record<string, JSONSchema7> = {
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
const SCORE_CHAT_TOOL_NAME = 'update_score_chat';
const SCORE_CHAT_TOOL = tool({
	description: "Reply to the user and report your current best understanding of both players' scores.",
	inputSchema: jsonSchema({
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
	})
});

// LaunchDarkly's model catalog keys models as "<Provider>.<model>" (e.g.
// "Anthropic.claude-sonnet-4-5"). The SDK normally hands back the bare API id
// in model.name, but strip the prefix defensively -- Anthropic rejects the
// catalog form, and the failure would surface as an opaque 502.
function toAnthropicModel(name: string | undefined, fallback: string): string {
	return (name || fallback).replace(/^[A-Za-z]+\./, '');
}

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
	history: ModelMessage[];
	resumptionToken: string | null;
};

// Once the model has read a photo and extracted its numbers, the raw bytes are
// dead weight in a history that gets resent on every subsequent turn. Swapping
// them for a text marker keeps the memory that a photo was shown without
// paying to re-upload it for the rest of the conversation.
const PHOTO_PLACEHOLDER = '[photo of a score tracker — already read]';

function stripImages(message: ModelMessage): ModelMessage {
	if (typeof message.content === 'string') return message;
	return {
		...message,
		content: message.content.map((part) =>
			part.type === 'image' ? { type: 'text' as const, text: PHOTO_PLACEHOLDER } : part
		)
	} as ModelMessage;
}

// The browser round-trips this history back to us on every turn, so it is
// attacker-controlled input like any other form field -- never trusted to be
// well-formed, and never trusted to be the same history we handed out.
export const MAX_HISTORY_CHARS = 256 * 1024;
const MAX_HISTORY_MESSAGES = 60;

// `system` is excluded deliberately: the client never legitimately holds one,
// so accepting it back would let a resend inject instructions.
function isModelMessage(value: unknown): value is ModelMessage {
	if (!value || typeof value !== 'object') return false;
	const message = value as Record<string, unknown>;
	if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'tool') {
		return false;
	}
	if (typeof message.content === 'string') return message.content.length > 0;
	return Array.isArray(message.content) && message.content.length > 0;
}

/**
 * Coerces client-supplied history into something safe to send to the model.
 *
 * Drops anything that isn't a well-formed message, strips image parts (we
 * replaced every image we've seen with a placeholder before handing history
 * back, so an image here is a replay or an injection -- and re-uploading bytes
 * is exactly the cost this design avoids), and caps the length. Trimming the
 * head can orphan a tool result whose tool call is now gone, which the API
 * rejects, so the trimmed history is realigned to start on a real user turn.
 */
export function sanitizeHistory(raw: unknown): ModelMessage[] {
	if (!Array.isArray(raw)) return [];

	const messages = raw.filter(isModelMessage).map(stripImages).slice(-MAX_HISTORY_MESSAGES);
	const start = messages.findIndex((message) => message.role === 'user');
	return start === -1 ? [] : messages.slice(start);
}

// Flattens the conversation to one plain-text message per turn for a judge to
// read. Image and tool parts are dropped -- a judge is scoring the assistant's
// words, and the raw parts are noise it can't use. The judge renders these as
// "<role>: <content>" itself, so they must stay one message per turn.
function toJudgeMessages(messages: ModelMessage[]): LDMessage[] {
	return messages
		.map((message) => {
			const content =
				typeof message.content === 'string'
					? message.content
					: message.content
							.filter((part) => part.type === 'text')
							.map((part) => part.text)
							.join(' ');
			return { role: message.role, content };
		})
		.filter((message): message is LDMessage => message.role !== 'tool' && !!message.content);
}

/**
 * Runs the judges attached to the AI Config against this turn's reply.
 *
 * `createJudge` builds its runner from `SUPPORTED_AI_PROVIDERS` (openai /
 * langchain / vercel), which is why this turn talks to Anthropic through the
 * Vercel AI SDK rather than Anthropic's own client: it makes 'vercel' a usable
 * provider here, and the SDK then owns sampling, the reserved
 * message_history / response_to_evaluate prompt shape, the structured
 * score/reasoning schema, and the judge's own token metrics.
 *
 * Unsampled results are not tracked, matching what the SDK does for judges it
 * runs itself.
 *
 * Awaited rather than fired-and-forgotten: an un-awaited promise is not
 * guaranteed to survive a serverless response, and losing the events defeats
 * the point of having judges. Both run concurrently, so the cost is one extra
 * round-trip on sampled turns. Nothing here can fail the turn.
 */
async function runJudges(
	aiClient: LDAIClient,
	// Note the SDK names this field `key`, while the REST API calls the same
	// thing `judgeConfigKey` -- as does trackJudgeResult.
	judges: LDJudge[],
	tracker: LDAIConfigTracker | undefined,
	context: LDContext,
	messages: ModelMessage[],
	reply: string
): Promise<void> {
	const judgeMessages = toJudgeMessages(messages);
	await Promise.all(
		judges.map(async ({ key: judgeConfigKey, samplingRate }) => {
			try {
				const judge = await aiClient.createJudge(
					judgeConfigKey,
					context,
					undefined,
					undefined,
					'vercel',
					samplingRate
				);
				// Undefined when the judge is disabled or its provider can't be
				// resolved -- neither is an error worth reporting as a failed run.
				if (!judge) return;

				const result = await judge.evaluateMessages(judgeMessages, {
					content: reply,
					metrics: { success: true }
				});
				if (result.sampled) tracker?.trackJudgeResult(result);
			} catch (err) {
				console.error(`Judge ${judgeConfigKey} failed`, err);
				tracker?.trackJudgeResult({
					judgeConfigKey,
					success: false,
					sampled: true,
					errorMessage: err instanceof Error ? err.message : 'Judge evaluation failed.'
				});
			}
		})
	);
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
 *
 * `requestHeaders` are the incoming request's, forwarded only to carry the
 * browser's trace context into the span this opens -- see `withLlmSpan`.
 */
export async function runScoreChatTurn(
	history: ModelMessage[],
	newUserContent: UserContent,
	user: ServerLDUser,
	profile: ServerLDProfile,
	conversationId: string,
	requestHeaders?: Headers
): Promise<ScoreChatTurnResult> {
	// This is the seam where LaunchDarkly decides how this turn behaves. Three
	// things come out of the single `agentConfig` call below, and none of them
	// are decided by this file:
	//
	// 1. WHICH MODEL. `aiConfig.model.name` is a model *name* served as data
	//    ("claude-haiku-4-5-20251001"). This file still picks the provider and
	//    the credential -- it builds an Anthropic client with an Anthropic key
	//    a few lines down -- so LaunchDarkly can move the turn between Anthropic
	//    models without a deploy, but choosing a non-Anthropic model there hands
	//    an unrecognized name to that client and fails the turn. LaunchDarkly's
	//    catalog keys models as "<Provider>.<model>", which `toAnthropicModel`
	//    strips; it also serves models Anthropic has since retired, and those
	//    fail the same way.
	//
	// 2. WHICH PROMPT. The resolved variation carries `instructions`, the
	//    standing system prompt. Editing it in LaunchDarkly changes behaviour on
	//    the next request, which is the whole point of putting it here rather
	//    than in this file.
	//
	// 3. WHICH USERS GET WHICH. `context` is the evaluation context (see
	//    buildServerContext: kind `user`, keyed on the user id, carrying name,
	//    tournament history and match count). Targeting rules and percentage
	//    rollouts run against it, so two players can be served different prompts
	//    *and* different models on the same deploy. Bucketing is deterministic
	//    on the context key, so one user stays on one variation -- which is why
	//    a test suite that always signs in as the same account only ever
	//    exercises one side of a rollout (see e2e/helpers.ts loginAsFreshUser).
	//
	// The values passed here are the defaults, used only when LaunchDarkly is
	// unreachable or the config is off -- never the normal path.
	//
	// Agent mode (rather than the completion mode the one-shot scans use):
	// this is a single conversational agent with standing instructions, which
	// is what `instructions` models, not a per-call prompt template.
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	// The trailing 'vercel' names the provider package up front. Without it the
	// SDK walks its built-in list -- langchain before vercel -- and logs a
	// failed package load for langchain on every single turn before falling
	// through to the one we actually installed. Naming it skips the walk.
	const aiConfig = aiClient
		? await aiClient.agentConfig(
				SCORE_CHAT_CONFIG_KEY,
				context,
				{ model: { name: DEFAULT_MODEL }, instructions: DEFAULT_PROMPT },
				undefined,
				'vercel'
			)
		: null;
	const tracker = aiConfig?.createTracker();
	const newUserMessage: ModelMessage = { role: 'user', content: newUserContent };

	if (!env.ANTHROPIC_API_KEY) {
		tracker?.trackSuccess();
		// Returns without going through withLlmSpan, so this path has to flush
		// its own event or the serverless invocation freezes on top of it.
		await flushLdTelemetry();
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

	// The two values LaunchDarkly actually decides for this turn, unpacked. Both
	// fall back to the local defaults only when it had nothing to serve.
	const modelName = toAnthropicModel(aiConfig?.model?.name, DEFAULT_MODEL);
	const systemPrompt = aiConfig?.instructions ?? DEFAULT_PROMPT;
	const messages = [...history, newUserMessage];

	// The whole turn -- the reply generation *and* the judge calls it triggers --
	// runs inside one span, so a trace shows the judging as part of the turn that
	// caused it rather than as unrelated roots. The span is also what lets
	// LaunchDarkly associate the trace with the evaluated AI Config: the tracker
	// records metrics, but metrics alone carry no trace association.
	return withLlmSpan('llm.chat', requestHeaders, async (setSpanAttributes) => {
		setSpanAttributes({
			'launchdarkly.ai.config.key': SCORE_CHAT_CONFIG_KEY,
			// LaunchDarkly only renders a span as an LLM trace when it carries the
			// GenAI semantic-convention attributes, and only groups spans into a
			// conversation when they share `gen_ai.conversation.id` -- the one
			// attribute it treats as required. `provider.name` is what it costs a
			// call against; `system` is the older spelling of the same thing, kept
			// because the observability plugin still reads it.
			'gen_ai.conversation.id': conversationId,
			'gen_ai.operation.name': 'chat',
			'gen_ai.provider.name': 'anthropic',
			'gen_ai.request.model': modelName,
			'gen_ai.system': 'anthropic'
		});

		const model = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelName);
		// Extracting the reply inside the tracked call is deliberate: a response
		// that arrives without one is a failed run, and trackMetricsOf only sees
		// that if the throw happens within its callback.
		const call = async () => {
			const response = await generateText({
				model,
				// Roomier than the one-shot scans' 256: replies now carry real
				// conversational text alongside the structured reading.
				maxOutputTokens: 512,
				system: systemPrompt,
				tools: { [SCORE_CHAT_TOOL_NAME]: SCORE_CHAT_TOOL },
				toolChoice: { type: 'tool', toolName: SCORE_CHAT_TOOL_NAME },
				messages
			});
			const toolCall = response.toolCalls[0];
			if (!toolCall) {
				throw new Error('Model did not return a structured reply.');
			}
			const input = toolCall.input as Record<string, unknown>;
			const reply = typeof input.reply === 'string' ? input.reply : '';
			if (!reply) {
				throw new Error('Model did not return a reply.');
			}
			return { response, toolCall, input, reply };
		};

		const { response, toolCall, input, reply } = tracker
			? await tracker.trackMetricsOf((r) => getAIMetricsFromResponse(r.response), call)
			: await call();

		// Cache counts are broken out because LaunchDarkly prices cached input
		// differently from fresh input, and Anthropic serves most of a
		// conversation's history from cache by the third or fourth turn.
		const inputDetails = response.usage?.inputTokenDetails;
		setSpanAttributes({
			'gen_ai.usage.input_tokens': response.usage?.inputTokens ?? 0,
			'gen_ai.usage.output_tokens': response.usage?.outputTokens ?? 0,
			'gen_ai.usage.cache_read.input_tokens': inputDetails?.cacheReadTokens ?? 0,
			'gen_ai.usage.cache_creation.input_tokens': inputDetails?.cacheWriteTokens ?? 0,
			'gen_ai.response.finish_reasons': response.finishReason
		});

		// Judges are attached to the score-chat config in LaunchDarkly, so they
		// arrive on the resolved config rather than being listed here: each entry
		// is a key plus a sampling rate (today `toxicity` at 0.1 and
		// `score-read-judge` at 0.5). Each of those keys is a *separate* AI
		// Config with its own prompt and its own model -- which is why a day's
		// token usage shows a model this file never asks for. Adding or removing
		// a judge, or changing what it scores, is a LaunchDarkly edit; nothing
		// here changes. See runJudges for how one is resolved and run.
		const judges = aiConfig?.judgeConfiguration?.judges;
		if (aiClient && judges?.length) {
			await runJudges(aiClient, judges, tracker, context, messages, reply);
		}

		return {
			reply,
			you: parseReading(input.you),
			opponent: parseReading(input.opponent),
			history: [
				...history,
				stripImages(newUserMessage),
				...response.response.messages,
				// Every tool call has to be answered before the conversation can
				// continue, so the turn closes itself out with a synthetic result.
				{
					role: 'tool' as const,
					content: [
						{
							type: 'tool-result' as const,
							toolCallId: toolCall.toolCallId,
							toolName: SCORE_CHAT_TOOL_NAME,
							output: { type: 'text' as const, value: 'ok' }
						}
					]
				}
			],
			resumptionToken: tracker?.resumptionToken ?? null
		};
	});
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
	// This request does nothing *but* record an event, so returning before it
	// is delivered would make the whole endpoint a no-op on serverless.
	await flushLdTelemetry();
	return true;
}
