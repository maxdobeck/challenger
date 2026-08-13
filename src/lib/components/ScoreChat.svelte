<script lang="ts">
	import { downscaleImageForUpload } from '$lib/imageDownscale';

	type Category = 'crit' | 'kill' | 'tac';
	type ChatReading = { crit: number; kill: number; tac: number; primaryOpChoice: Category | null };
	type ScoreResult = { crit: number; kill: number; tac: number; primary: number; primaryOpChoice: Category };
	type ChatTurn = { role: 'user' | 'assistant'; text: string };
	type Side = 'you' | 'opponent';

	let { onConfirm }: { onConfirm: (result: { you: ScoreResult; opponent: ScoreResult }) => void } =
		$props();

	const CATEGORY_LABELS: Record<Category, string> = { crit: 'Crit', kill: 'Kill', tac: 'Tac' };
	const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
	const GREETING =
		"Hi! Send a photo of your score tracker or just tell me the numbers — for you and your opponent — and I'll help you log it.";

	let transcript = $state<ChatTurn[]>([]);
	// Opaque to the client: the server owns this shape (Anthropic message
	// params, including the tool_use/tool_result pairing that gives the
	// conversation its memory). We only store it and hand it straight back.
	let history = $state<unknown[]>([]);
	let you = $state<ChatReading | null>(null);
	let opponent = $state<ChatReading | null>(null);
	let textValue = $state('');
	let sending = $state(false);
	let error = $state<string | null>(null);
	let resumptionToken = $state<string | null>(null);
	let feedbackGiven = $state<'positive' | 'negative' | null>(null);

	const bothSidesReady = $derived(!!you?.primaryOpChoice && !!opponent?.primaryOpChoice);

	// Keeps the newest turn in view. An attachment re-runs whenever the
	// reactive values it reads change, so appending a turn (or flipping the
	// thinking indicator) scrolls on its own.
	function pinToBottom(node: HTMLElement) {
		// Bubbles rendered below the standing greeting. Reading these is also
		// what registers the attachment's reactive dependencies, so it re-runs
		// on each new turn and when the thinking indicator toggles.
		const bubbles = transcript.length + (sending ? 1 : 0);
		if (bubbles > 0) node.scrollTop = node.scrollHeight;
	}

	function primaryFor(reading: ChatReading): number {
		return reading.primaryOpChoice ? Math.ceil(reading[reading.primaryOpChoice] / 2) : 0;
	}

	function toResult(reading: ChatReading): ScoreResult {
		return {
			crit: reading.crit,
			kill: reading.kill,
			tac: reading.tac,
			primary: primaryFor(reading),
			// Only ever called behind the bothSidesReady guard, which is what
			// establishes this is set.
			primaryOpChoice: reading.primaryOpChoice as Category
		};
	}

	async function sendMessage({ text, image }: { text?: string; image?: Blob }) {
		if (sending) return;

		const formData = new FormData();
		formData.append('history', JSON.stringify(history));
		if (text) formData.append('text', text);
		if (image) formData.append('image', image, 'score-tracker.jpg');

		transcript.push({ role: 'user', text: text ?? '📷 Photo of my score tracker' });
		sending = true;
		error = null;

		try {
			const res = await fetch('/matches/scan/chat', { method: 'POST', body: formData });
			if (res.status === 429) {
				throw new Error("You've hit today's scan limit — enter these scores manually.");
			}
			if (!res.ok) {
				// SvelteKit's error(status, message) endpoints reply with JSON
				// {message}; a platform-level rejection (e.g. a host's payload-size
				// limit) won't be, so fall back to the generic status message.
				const body = await res.json().catch(() => null);
				throw new Error(body?.message ?? `Chat failed (${res.status}).`);
			}

			const result = await res.json();
			transcript.push({ role: 'assistant', text: result.reply });
			history = result.history;
			you = result.you;
			opponent = result.opponent;
			resumptionToken = result.resumption_token;
			// A fresh reading is a fresh thing to judge, so let the user rate it
			// again rather than leaving the first verdict stuck to it.
			feedbackGiven = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
		} finally {
			sending = false;
		}
	}

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const blob = await downscaleImageForUpload(file);
			await sendMessage({ image: blob });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read that photo.';
		} finally {
			input.value = '';
		}
	}

	function submitText() {
		const value = textValue.trim();
		if (!value) return;
		textValue = '';
		sendMessage({ text: value });
	}

	// Deliberately a real turn rather than a local state flip: the model asked
	// which op is Primary, so the answer has to actually reach it -- typing
	// "kill" and tapping the Kill button take the identical path.
	function choosePrimary(side: Side, category: Category) {
		const label = CATEGORY_LABELS[category];
		sendMessage({
			text: side === 'you' ? `My Primary op is ${label}.` : `My opponent's Primary op is ${label}.`
		});
	}

	async function submitFeedback(kind: 'positive' | 'negative') {
		if (feedbackGiven) return;
		feedbackGiven = kind;
		try {
			await fetch('/matches/scan/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resumption_token: resumptionToken, kind })
			});
		} catch {
			// The acknowledgement already showed; a failed rating isn't worth
			// interrupting the flow the user is actually here for.
		}
	}

	function confirm() {
		if (!you?.primaryOpChoice || !opponent?.primaryOpChoice) return;
		onConfirm({ you: toResult(you), opponent: toResult(opponent) });
		startOver();
	}

	function startOver() {
		transcript = [];
		history = [];
		you = null;
		opponent = null;
		textValue = '';
		error = null;
		resumptionToken = null;
		feedbackGiven = null;
	}
</script>

<div class="score-chat card stack">
	<div class="chat-history" {@attach pinToBottom}>
		<p class="bubble assistant">{GREETING}</p>
		{#each transcript as turn, i (i)}
			<p class="bubble {turn.role}">{turn.text}</p>
		{/each}
		{#if sending}
			<p class="bubble assistant muted">Thinking…</p>
		{/if}
	</div>

	{#if you || opponent}
		<dl class="reading-summary">
			{#each [{ side: 'you' as Side, label: 'You', reading: you }, { side: 'opponent' as Side, label: 'Opponent', reading: opponent }] as entry (entry.side)}
				<div>
					<dt>{entry.label}</dt>
					<dd data-testid="reading-{entry.side}">
						{#if entry.reading}
							Crit {entry.reading.crit} · Kill {entry.reading.kill} · Tac {entry.reading.tac}
							{#if entry.reading.primaryOpChoice}
								· Primary {primaryFor(entry.reading)} ({CATEGORY_LABELS[entry.reading.primaryOpChoice]})
							{/if}
						{:else}
							<span class="muted">Not known yet</span>
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#each [{ side: 'you' as Side, reading: you, label: 'Your Primary' }, { side: 'opponent' as Side, reading: opponent, label: "Opponent's Primary" }] as entry (entry.side)}
		{#if entry.reading && !entry.reading.primaryOpChoice}
			<div class="quick-reply" role="group" aria-label="{entry.label} op">
				<span class="muted">Quick reply:</span>
				{#each CATEGORIES as category (category)}
					<button
						type="button"
						aria-label="{entry.label}: {CATEGORY_LABELS[category]}"
						disabled={sending}
						onclick={() => choosePrimary(entry.side, category)}
					>
						{CATEGORY_LABELS[category]}
					</button>
				{/each}
			</div>
		{/if}
	{/each}

	<div class="input-controls">
		<label>
			Choose File / Take Photo
			<input type="file" accept="image/*" disabled={sending} onchange={handleFileChange} />
		</label>
		<form
			class="chat-input-row"
			onsubmit={(e) => {
				e.preventDefault();
				submitText();
			}}
		>
			<textarea
				rows="2"
				placeholder="Describe your score, e.g. 3 crit, 2 kill, 4 tac"
				aria-label="Describe your score"
				bind:value={textValue}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						submitText();
					}
				}}
			></textarea>
			<button
				type="submit"
				class="send-button"
				aria-label="Send"
				disabled={sending || !textValue.trim()}
			>
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
					<path
						d="M12 19V5M12 5L6 11M12 5l6 6"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</form>
	</div>

	{#if bothSidesReady}
		<div class="feedback-row">
			{#if feedbackGiven}
				<span class="muted">Thanks for the feedback!</span>
			{:else}
				<span class="muted">Did I get this right?</span>
				<button
					type="button"
					class="button-secondary"
					aria-label="Yes, this looks right"
					onclick={() => submitFeedback('positive')}>👍</button
				>
				<button
					type="button"
					class="button-secondary"
					aria-label="No, this is wrong"
					onclick={() => submitFeedback('negative')}>👎</button
				>
			{/if}
		</div>
		<div class="action-row">
			<button type="button" disabled={sending} onclick={confirm}>Confirm</button>
			<button type="button" class="button-secondary" disabled={sending} onclick={startOver}>
				Start over
			</button>
		</div>
	{/if}

	{#if error}
		<p class="error">{error}</p>
	{/if}
</div>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-width: 100%;
	}

	input[type='file'] {
		max-width: 100%;
	}

	input[type='file']::file-selector-button:hover,
	input[type='file']::-webkit-file-upload-button:hover {
		background: #800080;
		color: #fff;
	}

	.chat-history {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 16rem;
		overflow-y: auto;
		padding: 0.25rem;
	}

	.bubble {
		margin: 0;
		max-width: 85%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.75rem;
		white-space: pre-wrap;
	}

	.bubble.user {
		align-self: flex-end;
		background: var(--color-accent);
		color: #fff;
	}

	.bubble.assistant {
		align-self: flex-start;
		background: var(--color-surface-alt, rgba(128, 128, 128, 0.15));
	}

	.reading-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin: 0;
	}

	.reading-summary dt {
		font-weight: 600;
		font-size: 0.85rem;
	}

	.reading-summary dd {
		margin: 0;
	}

	.quick-reply,
	.feedback-row,
	.action-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.input-controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.chat-input-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.chat-input-row textarea {
		flex: 1;
		min-width: 0;
		resize: vertical;
		border-radius: 0.75rem;
		padding: 0.6rem 1rem;
		font: inherit;
	}

	.send-button {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		border: none;
		background: var(--color-accent);
		color: #fff;
		cursor: pointer;
	}

	.send-button:hover:not(:disabled) {
		background: var(--color-masthead-dark);
	}

	.send-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
