import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { getAiClient } from './ldClient';
import { buildServerContext, type ServerLDUser, type ServerLDProfile } from './context';

export type ScoreScanResult = { crit: number; kill: number; tac: number };

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

// Shared by the vision (photo) and text (natural-language) score-parsing
// paths: both resolve a completion-mode AI Config for `aiConfigKey`, then --
// only if ANTHROPIC_API_KEY is actually set -- call the real model with the
// resolved (or default) model/prompt. Without a key, the model call itself is
// mocked, but the LD Config evaluation and tracking above it still run for
// real whenever LaunchDarkly is configured. This is the "real if configured,
// mocked otherwise" seam used throughout this feature (see also
// src/lib/server/demo/kv.ts and src/lib/server/scanThrottle.ts).
export async function runScoreCompletion(
	aiConfigKey: string,
	defaultModel: string,
	defaultPrompt: string,
	userContent: Anthropic.Messages.MessageParam['content'],
	user: ServerLDUser,
	profile: ServerLDProfile
): Promise<ScoreScanResult> {
	const context = buildServerContext(user, profile);
	const aiClient = await getAiClient();
	const aiConfig = aiClient
		? await aiClient.completionConfig(aiConfigKey, context, {
				model: { name: defaultModel },
				messages: [{ role: 'system', content: defaultPrompt }]
			})
		: null;
	const tracker = aiConfig?.createTracker();

	if (!env.ANTHROPIC_API_KEY) {
		tracker?.trackSuccess();
		return mockScoreResult();
	}

	const modelName = aiConfig?.model?.name ?? defaultModel;
	const systemPrompt = aiConfig?.messages?.[0]?.content ?? defaultPrompt;

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
		return parsed;
	} catch (err) {
		tracker?.trackError();
		throw err;
	}
}
