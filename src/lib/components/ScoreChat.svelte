<script lang="ts">
	type Category = 'crit' | 'kill' | 'tac';
	type Tally = { crit: number; kill: number; tac: number };
	type ScoreResult = { crit: number; kill: number; tac: number; primary: number; primaryOpChoice: Category };

	let { onConfirm }: { onConfirm: (result: ScoreResult) => void } = $props();

	type Step = 'choose-input' | 'text-entry' | 'scanning' | 'review-tally' | 'confirm';

	let step = $state<Step>('choose-input');
	let error = $state<string | null>(null);
	let tally = $state<Tally | null>(null);
	let primaryChoice = $state<Category | null>(null);
	let textValue = $state('');

	const derivedPrimary = $derived(
		tally && primaryChoice ? Math.ceil(tally[primaryChoice] / 2) : 0
	);

	const isMobile = $derived(
		typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
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
			step = 'review-tally';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Scan failed.';
			step = 'choose-input';
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
	}
</script>

<div class="score-chat card stack">
	{#if step === 'choose-input'}
		<p>How do you want to log your score?</p>
		<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
			<label>
				Upload Photo
				<input type="file" accept="image/*" onchange={handleFileChange} />
			</label>
			{#if isMobile}
				<label>
					Take Picture
					<input type="file" accept="image/*" capture="environment" onchange={handleFileChange} />
				</label>
			{/if}
		</div>
		<button type="button" class="button-secondary" onclick={() => (step = 'text-entry')}>
			Type your score instead
		</button>
	{:else if step === 'text-entry'}
		<label>
			Describe your score
			<input
				type="text"
				placeholder="e.g. 3 crit, 2 kill, 4 tac"
				bind:value={textValue}
				onkeydown={(e) => e.key === 'Enter' && submitText()}
			/>
		</label>
		<div style="display:flex; gap:0.5rem;">
			<button type="button" onclick={submitText}>Parse</button>
			<button type="button" class="button-secondary" onclick={startOver}>Back</button>
		</div>
	{:else if step === 'scanning'}
		<p class="muted">Reading your score…</p>
	{:else if step === 'review-tally' && tally}
		<p>Here's what I read: CRIT {tally.crit}, KILL {tally.kill}, TAC {tally.tac}.</p>
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
</style>
