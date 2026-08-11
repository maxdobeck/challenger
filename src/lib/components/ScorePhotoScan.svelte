<script lang="ts">
	type Scores = { crit: number; tac: number; kill: number; primary: number };
	type Draft = { crit: number; kill: number; tac: number };
	type Status = 'idle' | 'compressing' | 'scanning' | 'error';

	let { label, scores = $bindable() }: { label: string; scores: Scores } = $props();

	const fieldId = $derived(label.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

	let fileInput: HTMLInputElement | undefined;
	let dragOver = $state(false);
	let status = $state<Status>('idle');
	let errorMessage = $state('');
	let draft = $state<Draft | null>(null);
	let primaryCategory = $state<keyof Draft | null>(null);

	const computedPrimary = $derived(
		draft && primaryCategory ? Math.ceil(draft[primaryCategory] / 2) : null
	);

	function blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const result = reader.result as string;
				const commaIndex = result.indexOf(',');
				resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
			};
			reader.onerror = () =>
				reject(reader.error ?? new Error('Failed to read the compressed image.'));
			reader.readAsDataURL(blob);
		});
	}

	// Resize to a max of 1024px on the long edge and re-encode as JPEG at
	// 0.8 quality, so the request stays well under Vercel's payload limit
	// and keeps model tokens/cost low.
	async function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
		const bitmap = await createImageBitmap(file);
		try {
			const maxEdge = 1024;
			const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
			const width = Math.round(bitmap.width * scale);
			const height = Math.round(bitmap.height * scale);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Image compression is not supported in this browser.');
			ctx.drawImage(bitmap, 0, 0, width, height);

			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/jpeg', 0.8)
			);
			if (!blob) throw new Error('Could not compress the image.');

			return { base64: await blobToBase64(blob), mediaType: 'image/jpeg' };
		} finally {
			bitmap.close();
		}
	}

	async function processFile(file: File) {
		if (!file.type.startsWith('image/')) {
			status = 'error';
			errorMessage = 'Please choose an image file.';
			return;
		}

		status = 'compressing';
		errorMessage = '';
		draft = null;
		primaryCategory = null;

		try {
			const { base64, mediaType } = await compressImage(file);
			status = 'scanning';

			const response = await fetch('/matches/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: base64, mediaType })
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok || !payload) {
				throw new Error(payload?.error ?? 'Could not scan that photo.');
			}

			draft = { crit: payload.crit_op, kill: payload.kill_op, tac: payload.tac_op };
			status = 'idle';
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : 'Could not scan that photo.';
		}
	}

	function onFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (file) processFile(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) processFile(file);
	}

	function captureFileInput(node: HTMLInputElement) {
		fileInput = node;
	}

	function applyToForm() {
		if (!draft) return;
		scores.crit = draft.crit;
		scores.kill = draft.kill;
		scores.tac = draft.tac;
		if (primaryCategory) {
			scores.primary = Math.ceil(draft[primaryCategory] / 2);
		}
		draft = null;
		primaryCategory = null;
	}
</script>

<div class="card scan-panel">
	<h3>Scan {label}'s tracker</h3>

	<div
		class="dropzone"
		class:dropzone-active={dragOver}
		role="button"
		tabindex="0"
		onclick={() => fileInput?.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fileInput?.click();
			}
		}}
		ondragover={(e) => {
			e.preventDefault();
			dragOver = true;
		}}
		ondragleave={() => (dragOver = false)}
		ondrop={onDrop}
	>
		{#if status === 'compressing'}
			<p class="muted">Preparing photo…</p>
		{:else if status === 'scanning'}
			<p class="muted">Reading scores…</p>
		{:else}
			<p class="muted">Drop a photo of the score tracker here, or click to choose one.</p>
		{/if}
	</div>
	<input
		{@attach captureFileInput}
		type="file"
		accept="image/*"
		class="visually-hidden"
		onchange={onFileChange}
	/>

	{#if status === 'error'}
		<p class="error">{errorMessage}</p>
	{/if}

	{#if draft}
		<div class="scan-results">
			<label>
				Crit (0-6)
				<input type="number" min="0" max="6" bind:value={draft.crit} />
			</label>
			<label>
				Kill (0-6)
				<input type="number" min="0" max="6" bind:value={draft.kill} />
			</label>
			<label>
				Tac (0-6)
				<input type="number" min="0" max="6" bind:value={draft.tac} />
			</label>
		</div>

		<fieldset class="primary-picker">
			<legend>Primary this turning point (optional)</legend>
			<div class="primary-options">
				{#each ['crit', 'kill', 'tac'] as const as category (category)}
					<label class="primary-option">
						<input
							type="radio"
							name="{fieldId}-primary"
							value={category}
							bind:group={primaryCategory}
						/>
						{category}
					</label>
				{/each}
			</div>
			{#if computedPrimary !== null}
				<p class="muted">
					Primary OP = ceil({draft[primaryCategory!]} / 2) = {computedPrimary}
				</p>
			{/if}
		</fieldset>

		<button type="button" class="button-secondary" onclick={applyToForm}>
			Apply to {label}'s scores
		</button>
	{/if}
</div>

<style>
	.scan-panel {
		margin-bottom: 1rem;
	}

	.scan-panel h3 {
		margin-top: 0;
		font-size: 1rem;
	}

	.dropzone {
		border: 1px dashed var(--color-border);
		border-radius: 4px;
		padding: 1.25rem;
		text-align: center;
		cursor: pointer;
	}

	.dropzone:hover,
	.dropzone-active {
		border-color: var(--color-accent);
	}

	.dropzone p {
		margin: 0;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.scan-results {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}

	.scan-results label {
		flex: 1;
		min-width: 90px;
	}

	.primary-picker {
		margin-top: 0.75rem;
	}

	.primary-options {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.primary-option {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		text-transform: capitalize;
	}

	.scan-panel button[type='button'] {
		margin-top: 0.75rem;
	}
</style>
