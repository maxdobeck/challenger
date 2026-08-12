<script lang="ts">
	import { flagVariation } from '$lib/stores/launchdarkly';
	import {
		DEFAULT_SCORE_SCAN_COPY,
		SCORE_SCAN_COPY_FLAG_KEY,
		resolveScoreScanCopy,
		interpolate,
		type ScoreScanCopy
	} from './scoreScanCopy';

	type Category = 'crit' | 'kill' | 'tac';
	type Tally = { crit: number; kill: number; tac: number };
	type ScoreResult = { crit: number; kill: number; tac: number; primary: number; primaryOpChoice: Category };

	let { onConfirm }: { onConfirm: (result: ScoreResult) => void } = $props();

	type Step = 'choose-input' | 'scanning' | 'review-tally' | 'confirm';

	let step = $state<Step>('choose-input');
	let error = $state<string | null>(null);
	let tally = $state<Tally | null>(null);
	let primaryChoice = $state<Category | null>(null);
	let textValue = $state('');
	let correctionText = $state('');
	let resumptionToken = $state<string | null>(null);
	let feedbackGiven = $state<'positive' | 'negative' | null>(null);

	const derivedPrimary = $derived(
		tally && primaryChoice ? Math.ceil(tally[primaryChoice] / 2) : 0
	);

	const rawCopy = flagVariation<Partial<ScoreScanCopy>>(
		SCORE_SCAN_COPY_FLAG_KEY,
		DEFAULT_SCORE_SCAN_COPY
	);
	const copy = $derived(resolveScoreScanCopy($rawCopy));

	// Shared by the initial scan and correction turns -- both post a FormData
	// to /matches/scan and expect the same {crit_op, kill_op, tac_op,
	// resumption_token} shape back. `onErrorStep` differs: a failed initial
	// scan has no tally to fall back to (choose-input), a failed correction
	// should keep whatever tally is already on screen (review-tally).
	async function submitFormData(formData: FormData, onErrorStep: Step) {
		step = 'scanning';
		error = null;
		try {
			const res = await fetch('/matches/scan', { method: 'POST', body: formData });
			if (res.status === 429) {
				throw new Error(copy.rateLimitError);
			}
			if (!res.ok) throw new Error(interpolate(copy.scanFailedError, { status: res.status }));

			const result = await res.json();
			tally = { crit: result.crit_op, kill: result.kill_op, tac: result.tac_op };
			resumptionToken = result.resumption_token ?? null;
			step = 'review-tally';
		} catch (err) {
			error = err instanceof Error ? err.message : copy.genericScanError;
			step = onErrorStep;
		}
	}

	async function submitScan(formData: FormData) {
		await submitFormData(formData, 'choose-input');
	}

	async function submitCorrection() {
		if (!correctionText.trim() || !tally) return;
		const formData = new FormData();
		formData.append('mode', 'correct');
		formData.append('prior_crit', String(tally.crit));
		formData.append('prior_kill', String(tally.kill));
		formData.append('prior_tac', String(tally.tac));
		formData.append('correction_text', correctionText.trim());
		correctionText = '';
		await submitFormData(formData, 'review-tally');
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
			// Best-effort -- feedbackGiven already reflects the user's action
			// regardless of whether this reached the server.
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
				throw new Error(copy.unreadableImageError);
			}
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error(copy.canvasUnsupportedError);
			ctx.drawImage(bitmap, 0, 0);

			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png')
			);
			if (!blob) throw new Error(copy.encodeFailedError);

			const formData = new FormData();
			formData.append('image', blob, 'score-tracker.png');
			await submitScan(formData);
		} catch (err) {
			error = err instanceof Error ? err.message : copy.genericPhotoError;
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
		correctionText = '';
		resumptionToken = null;
		feedbackGiven = null;
		error = null;
	}
</script>

<div class="score-chat card stack">
	{#if step === 'choose-input'}
		<p>{copy.chooseInputPrompt}</p>
		<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
			<label>
				{copy.fileInputLabel}
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
				placeholder={copy.textInputPlaceholder}
				aria-label={copy.textInputPlaceholder}
				bind:value={textValue}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						submitText();
					}
				}}
			/>
			<button
				type="submit"
				class="send-button"
				aria-label={copy.sendButtonAriaLabel}
				disabled={!textValue.trim()}
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
	{:else if step === 'scanning'}
		<p class="muted">{copy.scanningLabel}</p>
	{:else if step === 'review-tally' && tally}
		<p>{interpolate(copy.reviewTallyMessage, { crit: tally.crit, kill: tally.kill, tac: tally.tac })}</p>
		<form
			class="chat-input-row"
			onsubmit={(e) => {
				e.preventDefault();
				submitCorrection();
			}}
		>
			<input
				type="text"
				placeholder={copy.correctionInputPlaceholder}
				aria-label={copy.correctionInputPlaceholder}
				bind:value={correctionText}
			/>
			<button
				type="submit"
				class="send-button"
				aria-label={copy.sendButtonAriaLabel}
				disabled={!correctionText.trim()}
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
		<p>{copy.reviewTallyPrompt}</p>
		<div style="display:flex; gap:0.5rem;">
			<button type="button" onclick={() => choosePrimary('crit')}>{copy.primaryCritLabel}</button>
			<button type="button" onclick={() => choosePrimary('kill')}>{copy.primaryKillLabel}</button>
			<button type="button" onclick={() => choosePrimary('tac')}>{copy.primaryTacLabel}</button>
		</div>
	{:else if step === 'confirm' && tally && primaryChoice}
		<p>
			{interpolate(copy.confirmMessage, {
				primary: derivedPrimary,
				primaryValue: tally[primaryChoice],
				total: tally.crit + tally.kill + tally.tac + derivedPrimary
			})}
		</p>
		<div style="display:flex; gap:0.5rem; align-items:center;">
			<span>{copy.feedbackPrompt}</span>
			{#if feedbackGiven}
				<span class="muted">{copy.feedbackThanksMessage}</span>
			{:else}
				<button
					type="button"
					aria-label={copy.feedbackPositiveAriaLabel}
					onclick={() => submitFeedback('positive')}
				>
					👍
				</button>
				<button
					type="button"
					aria-label={copy.feedbackNegativeAriaLabel}
					onclick={() => submitFeedback('negative')}
				>
					👎
				</button>
			{/if}
		</div>
		<div style="display:flex; gap:0.5rem;">
			<button type="button" onclick={confirm}>{copy.confirmButtonLabel}</button>
			<button type="button" class="button-secondary" onclick={startOver}>
				{copy.startOverButtonLabel}
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
</style>
