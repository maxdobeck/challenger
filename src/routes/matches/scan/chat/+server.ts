import { error, json, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ModelMessage, UserContent } from 'ai';
import { env } from '$env/dynamic/private';
import { resolveMediaType } from '$lib/server/ai/scoreVision';
import { runScoreChatTurn, sanitizeHistory, MAX_HISTORY_CHARS } from '$lib/server/ai/scoreChat';
import { isThrottled, recordScanEvent } from '$lib/server/scanThrottle';
import { isThrottledByCookie, recordScanInCookie } from '$lib/server/scanThrottleCookie';
import { getUserProfile, DEFAULT_PROFILE } from '$lib/server/users';

const DEMO_MODE = env.DEMO_MODE === 'true';

// Same ceiling as the one-shot scan route: the client downscales before
// upload ($lib/imageDownscale), so this only ever fires for a bypass.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// Sent when the user uploads a photo without typing anything, so the turn
// still carries an instruction rather than a bare image.
const IMAGE_ONLY_PROMPT = 'Here is a photo of a score tracker card.';

// Mirrors the scan route: a failed turn still cost a model call, so letting
// failures go uncounted would let someone dodge the cap by forcing errors.
async function recordAttempt(userId: string, cookies: Cookies): Promise<void> {
	if (DEMO_MODE) {
		recordScanInCookie(cookies);
	} else {
		await recordScanEvent(userId);
	}
}

function parseHistoryField(raw: FormDataEntryValue | null): ModelMessage[] {
	if (typeof raw !== 'string' || !raw) return [];
	if (raw.length > MAX_HISTORY_CHARS) {
		error(400, 'This conversation has gotten too long — start over.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		error(400, 'Malformed conversation history.');
	}
	return sanitizeHistory(parsed);
}

// The client keeps one id for the life of a conversation so every turn's span
// groups under it. Like the history beside it that is untrusted input, and it
// ends up on a span rather than in a query, so anything that isn't the UUID we
// handed out is replaced instead of rejected -- a bad id is not worth failing a
// turn over, but it is not worth tracing under either.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseConversationId(raw: FormDataEntryValue | null): string {
	return typeof raw === 'string' && UUID_PATTERN.test(raw) ? raw : crypto.randomUUID();
}

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		error(401, 'Not logged in');
	}

	const throttled = DEMO_MODE ? isThrottledByCookie(event.cookies) : await isThrottled(user.id);
	if (throttled) {
		error(429, "You've hit today's scan limit — enter these scores manually.");
	}

	const formData = await event.request.formData();
	const image = formData.get('image');
	const text = formData.get('text')?.toString().trim();
	const history = parseHistoryField(formData.get('history'));
	const conversationId = parseConversationId(formData.get('conversation_id'));
	const hasImage = image instanceof Blob && image.size > 0;
	if (!hasImage && !text) {
		error(400, 'No image or text provided');
	}
	if (hasImage && (image as Blob).size > MAX_IMAGE_BYTES) {
		error(400, 'Image is too large.');
	}

	const content: Extract<UserContent, unknown[]> = [];
	if (hasImage) {
		const blob = image as Blob;
		content.push({
			type: 'image',
			image: Buffer.from(await blob.arrayBuffer()).toString('base64'),
			mediaType: resolveMediaType(blob)
		});
	}
	content.push({ type: 'text', text: text || IMAGE_ONLY_PROMPT });

	const profile = DEMO_MODE ? DEFAULT_PROFILE : await getUserProfile(user.id);
	const ldUser = { id: user.id, name: user.name, email: user.email };

	let result;
	try {
		result = await runScoreChatTurn(
			history,
			content,
			ldUser,
			profile,
			conversationId,
			event.request.headers
		);
	} catch (err) {
		await recordAttempt(user.id, event.cookies);
		console.error('Score chat turn failed', err);
		error(502, 'Could not read that. Try again or enter scores manually.');
	}

	await recordAttempt(user.id, event.cookies);
	return json({
		reply: result.reply,
		you: result.you,
		opponent: result.opponent,
		history: result.history,
		resumption_token: result.resumptionToken
	});
};
