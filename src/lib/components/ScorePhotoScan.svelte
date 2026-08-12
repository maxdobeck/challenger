<script lang="ts">
	type ScoreDraft = { crit: number; kill: number; tac: number };

	let {
		groupName,
		onApply
	}: {
		groupName: 'You' | 'Opponent';
		onApply: (scores: ScoreDraft) => void;
	} = $props();

	let scanning = $state(false);
	let error = $state<string | null>(null);
	let draft = $state<ScoreDraft | null>(null);

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		scanning = true;
		error = null;
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

			const res = await fetch('/matches/scan', { method: 'POST', body: formData });
			if (res.status === 429) {
				throw new Error("You've hit today's scan limit — enter these scores manually.");
			}
			if (!res.ok) throw new Error(`Scan failed (${res.status}).`);

			const result = await res.json();
			draft = { crit: result.crit_op, kill: result.kill_op, tac: result.tac_op };
		} catch (err) {
			error = err instanceof Error ? err.message : 'Scan failed.';
		} finally {
			scanning = false;
		}
	}

	function apply() {
		if (!draft) return;
		onApply(draft);
		draft = null;
	}
</script>

<div class="score-photo-scan">
	<label>
		Scan a scoreboard photo
		<input type="file" accept="image/*" onchange={handleFileChange} />
	</label>

	{#if scanning}
		<p class="muted">Scanning…</p>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if draft}
		<div class="scan-results card">
			<p class="muted">Scanned values — review before applying.</p>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
				<label style="flex:1;">
					Crit (0-6)
					<input type="number" min="0" max="6" bind:value={draft.crit} />
				</label>
				<label style="flex:1;">
					Kill (0-6)
					<input type="number" min="0" max="6" bind:value={draft.kill} />
				</label>
				<label style="flex:1;">
					Tac (0-6)
					<input type="number" min="0" max="6" bind:value={draft.tac} />
				</label>
			</div>
			<button type="button" class="button-secondary" onclick={apply}>
				Apply to {groupName}'s scores
			</button>
		</div>
	{/if}
</div>
