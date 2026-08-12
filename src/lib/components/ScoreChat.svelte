<script lang="ts">
	type Category = 'crit' | 'kill' | 'tac';
	type Tally = { crit: number; kill: number; tac: number };
	type ScoreResult = { crit: number; kill: number; tac: number; primary: number; primaryOpChoice: Category };

	let { onConfirm }: { onConfirm: (result: ScoreResult) => void } = $props();

	type Step = 'choose-input' | 'scanning' | 'review-tally' | 'confirm';

	type FeedbackState = 'idle' | 'negative-pending' | 'sent';

	let step = $state<Step>('choose-input');
	let error = $state<string | null>(null);
	let tally = $state<Tally | null>(null);
	let primaryChoice = $state<Category | null>(null);
	let textValue = $state('');

	let scanEventId = $state<number | null>(null);
	let aiConfigKey = $state<string | null>(null);
	let feedback = $state<FeedbackState>('idle');
	let feedbackComment = $state('');
	let correction = $state<Tally | null>(null);
	let feedbackError = $state<string | null>(null);

	const derivedPrimary = $derived(
		tally && primaryChoice ? Math.ceil(tally[primaryChoice] / 2) : 0
	);

	async function submitScan(formData: FormData) {
		step = 'scanning';
		error = null;
		try {
			const res = await fetch('/matches/scan', { method: 'POST', body: formData });
			if (res.status === 429) {
				throw new Error("You've hit today's scan limit — enter these scores manually.");
			}
			if (!res.ok) throw new Error(`Scan failed (${res.status}).`);

			const result = await res.json();
			tally = { crit: result.crit_op, kill: result.kill_op, tac: result.tac_op };
			scanEventId = result.scan_event_id ?? null;
			aiConfigKey = result.ai_config_key ?? null;
			feedback = 'idle';
			feedbackComment = '';
			correction = null;
			feedbackError = null;
			step = 'review-tally';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Scan failed.';
			step = 'choose-input';
		}
	}

	function beginNegativeFeedback() {
		if (!tally) return;
		correction = { ...tally };
		feedback = 'negative-pending';
	}

	async function sendFeedback(kind: 'positive' | 'negative') {
		if (!aiConfigKey) return;
		feedbackError = null;
		try {
			const res = await fetch('/matches/scan/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					scanEventId,
					aiConfigKey,
					kind,
					comment: kind === 'negative' ? feedbackComment.trim() || undefined : undefined,
					correctedCrit: kind === 'negative' ? correction?.crit : undefined,
					correctedKill: kind === 'negative' ? correction?.kill : undefined,
					correctedTac: kind === 'negative' ? correction?.tac : undefined
				})
			});
			if (!res.ok) throw new Error(`Feedback failed (${res.status}).`);
			feedback = 'sent';
		} catch {
			feedbackError = "Couldn't send feedback — try again.";
		}
	}

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			let bitmap: ImageBitmap;
			try {
				bitmap = await createImageBitmap(file);
			} catch {
				throw new Error("Couldn't read that image — try a PNG or JPEG screenshot instead.");
			}
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas is not supported in this browser.');
			ctx.drawImage(bitmap, 0, 0);

			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png')
			);
			if (!blob) throw new Error('Could not encode the photo.');

			const formData = new FormData();
			formData.append('image', blob, 'score-tracker.png');
			await submitScan(formData);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read that photo.';
		} finally {
			input.value = '';
		}
	}

	async function submitText() {
		if (!textValue.trim()) return;
		const formData = new FormData();
		formData.append('text', textValue.trim());
		await submitScan(formData);
	}

	function choosePrimary(category: Category) {
		primaryChoice = category;
		step = 'confirm';
	}

	function confirm() {
		if (!tally || !primaryChoice) return;
		onConfirm({ ...tally, primary: derivedPrimary, primaryOpChoice: primaryChoice });
		startOver();
	}

	function startOver() {
		step = 'choose-input';
		tally = null;
		primaryChoice = null;
		textValue = '';
		error = null;
		scanEventId = null;
		aiConfigKey = null;
		feedback = 'idle';
		feedbackComment = '';
		correction = null;
		feedbackError = null;
	}
</script>

<div class="score-chat card stack">
	{#if step === 'choose-input'}
		<p>How do you want to log your score?</p>
		<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
			<label>
				Choose File / Take Photo
				<input type="file" accept="image/*" onchange={handleFileChange} />
			</label>
		</div>
		<form
			class="chat-input-row"
			onsubmit={(e) => {
				e.preventDefault();
				submitText();
			}}
		>
			<input
				type="text"
				placeholder="Type your score instead"
				aria-label="Type your score instead"
				bind:value={textValue}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						submitText();
					}
				}}
			/>
			<button type="submit" class="send-button" aria-label="Send" disabled={!textValue.trim()}>
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
	{:else if step === 'scanning'}
		<p class="muted">Reading your score…</p>
	{:else if step === 'review-tally' && tally}
		<div class="ai-response-row">
			<p>Here's what I read: CRIT {tally.crit}, KILL {tally.kill}, TAC {tally.tac}.</p>
			{#if aiConfigKey && feedback !== 'sent'}
				<div class="feedback-buttons" role="group" aria-label="Rate this reading">
					<button
						type="button"
						class="feedback-button"
						aria-label="Thumbs up"
						disabled={feedback === 'negative-pending'}
						onclick={() => sendFeedback('positive')}
					>
						👍
					</button>
					<button
						type="button"
						class="feedback-button"
						aria-label="Thumbs down"
						disabled={feedback === 'negative-pending'}
						onclick={beginNegativeFeedback}
					>
						👎
					</button>
				</div>
			{:else if feedback === 'sent'}
				<span class="muted feedback-thanks">Thanks for the feedback!</span>
			{/if}
		</div>

		{#if feedback === 'negative-pending' && correction}
			<div class="feedback-correction card">
				<p class="muted">What should it have read?</p>
				<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
					<label style="flex:1;">
						Crit (0-6)
						<input type="number" min="0" max="6" bind:value={correction.crit} />
					</label>
					<label style="flex:1;">
						Kill (0-6)
						<input type="number" min="0" max="6" bind:value={correction.kill} />
					</label>
					<label style="flex:1;">
						Tac (0-6)
						<input type="number" min="0" max="6" bind:value={correction.tac} />
					</label>
				</div>
				<label>
					Anything else? (optional)
					<textarea
						rows="2"
						placeholder="e.g. &quot;no, that's the wrong score&quot;"
						bind:value={feedbackComment}
					></textarea>
				</label>
				<button type="button" onclick={() => sendFeedback('negative')}>Submit feedback</button>
			</div>
		{/if}

		{#if feedbackError}
			<p class="error">{feedbackError}</p>
		{/if}

		<p>Which op is your Primary?</p>
		<div style="display:flex; gap:0.5rem;">
			<button type="button" onclick={() => choosePrimary('crit')}>Crit</button>
			<button type="button" onclick={() => choosePrimary('kill')}>Kill</button>
			<button type="button" onclick={() => choosePrimary('tac')}>Tac</button>
		</div>
	{:else if step === 'confirm' && tally && primaryChoice}
		<p>
			Your Primary score is {derivedPrimary} (ceil({tally[primaryChoice]} / 2)), for a total of
			{tally.crit + tally.kill + tally.tac + derivedPrimary}.
		</p>
		<div style="display:flex; gap:0.5rem;">
			<button type="button" onclick={confirm}>Confirm</button>
			<button type="button" class="button-secondary" onclick={startOver}>Start over</button>
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

	.chat-input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-input-row input {
		flex: 1;
		border-radius: 999px;
		padding: 0.6rem 1rem;
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

	.ai-response-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.feedback-buttons {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.feedback-button {
		background: none;
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		line-height: 1;
	}

	.feedback-button:hover:not(:disabled) {
		border-color: var(--color-accent);
	}

	.feedback-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.feedback-thanks {
		font-size: 0.9rem;
	}

	.feedback-correction {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.feedback-correction textarea {
		width: 100%;
		resize: vertical;
	}
</style>
