import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { LDFeedbackKind } from '@launchdarkly/server-sdk-ai';
import { getAiClient } from './ldClient';
import { buildServerContext, type ServerLDUser, type ServerLDProfile } from './context';

export type ScoreScanResult = { crit: number; kill: number; tac: number };

// Wraps a scan/correction result with the AI Config tracker's resumption
// token -- an opaque string that lets a later, separate request (e.g. a
// thumbs-up/down submitted after the user reviews the reading) reconstruct
// the same tracker and attach feedback to the original AI run, without this
// stateless feature needing a database row to hold the tracker itself.
export type ScoreScanTurnResult = { result: ScoreScanResult; resumptionToken: string | null };

function mockScoreResult(): ScoreScanResult {
	const roll = () => Math.floor(Math.random() * 7);
	return { crit: roll(), kill: roll(), tac: roll() };
}

// A forced tool call rather than free-text + JSON.parse guarantees the
// response shape matches ScoreScanResult -- proven more reliable than parsing
// a text block (see the original direct-Anthropic implementation this was
// ported from, commit 97b44e9).
const SCORE_TOOL = {
	name: 'record_score_reading',
	description: 'Record the Crit, Kill, and Tac values read or parsed from the input.',
	input_schema: {
		type: 'object',
		properties: {
			crit: { type: 'integer', minimum: 0, maximum: 6, description: 'Crit value, 0-6' },
			kill: { type: 'integer', minimum: 0, maximum: 6, description: 'Kill value, 0-6' },
			tac: { type: 'integer', minimum: 0, maximum: 6, description: 'Tac value, 0-6' }
		},
		required: ['crit', 'kill', 'tac']
	}
} satisfies Anthropic.Tool;

function isPlausibleScoreResult(value: unknown): value is ScoreScanResult {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as ScoreScanResult).crit === 'number' &&
		typeof (value as ScoreScanResult).kill === 'number' &&
		typeof (value as ScoreScanResult).tac === 'number'
	);
}

// Shared by the vision (photo), text (natural-language), and correction
// score-parsing paths: all resolve an agent-mode AI Config for `aiConfigKey`,
// then -- only if ANTHROPIC_API_KEY is actually set -- call the real model
// with the resolved (or default) model/instructions. Without a key, the
// model call itself is mocked, but the LD Config evaluation and tracking
// above it still run for real whenever LaunchDarkly is configured. This is
// the "real if configured, mocked otherwise" seam used throughout this
// feature (see also src/lib/server/demo/kv.ts and
// src/lib/server/scanThrottle.ts).
async function runOnce(
	aiConfigKey: string,
	defaultModel: string,
	defaultPrompt: string,
	userContent: Anthropic.Messages.MessageParam['content'],
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanTurnResult> {
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	const aiConfig = aiClient
		? await aiClient.agentConfig(aiConfigKey, context, {
				enabled: true,
				model: { name: defaultModel },
				instructions: defaultPrompt
			})
		: null;
	const tracker = aiConfig?.createTracker();
	const resumptionToken = tracker?.resumptionToken ?? null;

	if (!env.ANTHROPIC_API_KEY) {
		tracker?.trackSuccess();
		return { result: mockScoreResult(), resumptionToken };
	}

	const modelName = aiConfig?.model?.name ?? defaultModel;
	const systemPrompt = aiConfig?.instructions ?? defaultPrompt;

	try {
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const start = Date.now();
		const response = await anthropic.messages.create({
			model: modelName,
			max_tokens: 256,
			system: systemPrompt,
			tools: [SCORE_TOOL],
			tool_choice: { type: 'tool', name: SCORE_TOOL.name },
			messages: [{ role: 'user', content: userContent }]
		});
		tracker?.trackDuration(Date.now() - start);
		tracker?.trackTokens({
			total: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
			input: response.usage?.input_tokens ?? 0,
			output: response.usage?.output_tokens ?? 0
		});

		const toolUse = response.content.find((block) => block.type === 'tool_use');
		const parsed = toolUse?.type === 'tool_use' ? toolUse.input : null;
		if (!isPlausibleScoreResult(parsed)) {
			throw new Error('Model did not return a structured reading.');
		}

		tracker?.trackSuccess();
		return { result: parsed, resumptionToken };
	} catch (err) {
		tracker?.trackError();
		throw err;
	}
}

export async function runScoreCompletion(
	aiConfigKey: string,
	defaultModel: string,
	defaultPrompt: string,
	userContent: Anthropic.Messages.MessageParam['content'],
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanTurnResult> {
	return runOnce(aiConfigKey, defaultModel, defaultPrompt, userContent, user, profile);
}

// A "correction" turn isn't a real multi-turn tool conversation -- Anthropic
// requires any tool_use block to be paired with a tool_result in the next
// user turn, and this feature has never built that plumbing (every call here
// is a single forced-tool-call structured-output trick, not an agent loop).
// Instead, the prior reading and the user's correction request get folded
// into one new user message, so this is just another single-shot call with
// the same shape as the initial scan/parse.
export async function runScoreCorrection(
	aiConfigKey: string,
	defaultModel: string,
	defaultPrompt: string,
	priorReading: ScoreScanResult,
	correctionText: string,
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanTurnResult> {
	const userContent =
		`Previous reading: CRIT ${priorReading.crit}, KILL ${priorReading.kill}, TAC ${priorReading.tac}. ` +
		`Apply this correction and report the full corrected reading: "${correctionText}"`;
	return runOnce(aiConfigKey, defaultModel, defaultPrompt, userContent, user, profile);
}

// Reconstructs the tracker from a scan/correction turn's resumption token so
// feedback submitted in a later, separate request still attaches to the
// original AI run's runId. No-ops when LaunchDarkly isn't configured.
export async function submitScoreFeedback(
	resumptionToken: string,
	kind: 'positive' | 'negative',
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<void> {
	const aiClient = await getAiClient();
	if (!aiClient) return;
	const context = buildServerContext(user, profile);
	const tracker = aiClient.createTracker(resumptionToken, context);
	tracker.trackFeedback({
		kind: kind === 'positive' ? LDFeedbackKind.Positive : LDFeedbackKind.Negative
	});
}
