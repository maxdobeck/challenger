<script lang="ts">
	import { flagVariation } from '$lib/stores/launchdarkly';
	import {
		DEFAULT_SCORE_SCAN_COPY,
		SCORE_SCAN_COPY_FLAG_KEY,
		resolveScoreScanCopy,
		interpolate,
		type ScoreScanCopy
	} from './scoreScanCopy';

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

	const rawCopy = flagVariation<Partial<ScoreScanCopy>>(
		SCORE_SCAN_COPY_FLAG_KEY,
		DEFAULT_SCORE_SCAN_COPY
	);
	const copy = $derived(resolveScoreScanCopy($rawCopy));

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

			const res = await fetch('/matches/scan', { method: 'POST', body: formData });
			if (res.status === 429) {
				throw new Error(copy.rateLimitError);
			}
			if (!res.ok) throw new Error(interpolate(copy.scanFailedError, { status: res.status }));

			const result = await res.json();
			draft = { crit: result.crit_op, kill: result.kill_op, tac: result.tac_op };
		} catch (err) {
			error = err instanceof Error ? err.message : copy.genericScanError;
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
		{copy.photoScanFileInputLabel}
		<input type="file" accept="image/*" onchange={handleFileChange} />
	</label>

	{#if scanning}
		<p class="muted">{copy.photoScanScanningLabel}</p>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if draft}
		<div class="scan-results card">
			<p class="muted">{copy.photoScanResultsHeading}</p>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
				<label style="flex:1;">
					{copy.photoScanCritLabel}
					<input type="number" min="0" max="6" bind:value={draft.crit} />
				</label>
				<label style="flex:1;">
					{copy.photoScanKillLabel}
					<input type="number" min="0" max="6" bind:value={draft.kill} />
				</label>
				<label style="flex:1;">
					{copy.photoScanTacLabel}
					<input type="number" min="0" max="6" bind:value={draft.tac} />
				</label>
			</div>
			<button type="button" class="button-secondary" onclick={apply}>
				{interpolate(copy.photoScanApplyButtonLabel, { groupName })}
			</button>
		</div>
	{/if}
</div>
