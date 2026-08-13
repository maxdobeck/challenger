<script lang="ts">
	import { onMount } from 'svelte';
	import { flags, ldContextKey, ldReady } from '$lib/stores/launchdarkly';

	type MemoryInfo = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };

	let { user, demoMode }: { user: { name: string; email: string; id: string } | null; demoMode: boolean } =
		$props();

	let open = $state(true);
	let fps = $state(0);
	let memory = $state<MemoryInfo | null>(null);
	let flagsOpen = $state(false);

	const flagCount = $derived(Object.keys($flags).length);
	const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

	onMount(() => {
		let frameCount = 0;
		let lastSample = performance.now();
		let rafId: number;

		function tick(now: number) {
			frameCount++;
			const elapsed = now - lastSample;
			if (elapsed >= 500) {
				fps = Math.round((frameCount * 1000) / elapsed);
				frameCount = 0;
				lastSample = now;
			}
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);

		// performance.memory is a non-standard Chrome-only API whose fields are
		// getters, not own enumerable properties, so they must be read by name
		// rather than spread (spreading silently yields NaNs after mb() divides).
		const perf = performance as Performance & { memory?: MemoryInfo };
		const readMemory = (): MemoryInfo | null =>
			perf.memory
				? {
						usedJSHeapSize: perf.memory.usedJSHeapSize,
						totalJSHeapSize: perf.memory.totalJSHeapSize,
						jsHeapSizeLimit: perf.memory.jsHeapSizeLimit
					}
				: null;
		let memoryInterval: ReturnType<typeof setInterval> | undefined;
		if (perf.memory) {
			memoryInterval = setInterval(() => {
				memory = readMemory();
			}, 1000);
			memory = readMemory();
		}

		return () => {
			cancelAnimationFrame(rafId);
			if (memoryInterval) clearInterval(memoryInterval);
		};
	});
</script>

<div class="dev-panel" class:collapsed={!open}>
	<button type="button" class="dev-panel-toggle" onclick={() => (open = !open)}>
		<span>🛠 Dev Panel</span>
		<span class="chevron">{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		<div class="dev-panel-body">
			<section>
				<h4>Performance</h4>
				<dl>
					<dt>FPS</dt>
					<dd class:warn={fps > 0 && fps < 45}>{fps || '—'}</dd>
					{#if memory}
						<dt>Memory used</dt>
						<dd>{mb(memory.usedJSHeapSize)} / {mb(memory.jsHeapSizeLimit)}</dd>
						<dt>Heap total</dt>
						<dd>{mb(memory.totalJSHeapSize)}</dd>
					{:else}
						<dt>Memory used</dt>
						<dd class="muted">unavailable</dd>
					{/if}
				</dl>
			</section>

			<section>
				<h4>User</h4>
				{#if user}
					<dl>
						<dt>Name</dt>
						<dd>{user.name}</dd>
						<dt>Email</dt>
						<dd>{user.email}</dd>
						<dt>ID</dt>
						<dd class="mono">{user.id}</dd>
						{#if demoMode}
							<dt>Mode</dt>
							<dd>Demo</dd>
						{/if}
					</dl>
				{:else}
					<p class="muted">Not logged in</p>
				{/if}
			</section>

			<section>
				<h4>LaunchDarkly</h4>
				<dl>
					<dt>Client</dt>
					<dd class:good={$ldReady} class:warn={!$ldReady}>{$ldReady ? 'ready' : 'initializing'}</dd>
					<dt>Context key</dt>
					<dd class="mono">{$ldContextKey ?? '—'}</dd>
					<dt>Flags loaded</dt>
					<dd>{flagCount}</dd>
				</dl>
				{#if flagCount > 0}
					<button type="button" class="flags-toggle" onclick={() => (flagsOpen = !flagsOpen)}>
						{flagsOpen ? 'Hide' : 'Show'} flag values
					</button>
					{#if flagsOpen}
						<ul class="flag-list">
							{#each Object.entries($flags) as [key, value] (key)}
								<li>
									<span class="mono flag-key">{key}</span>
									<span class="flag-value">{JSON.stringify(value)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.dev-panel {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 9999;
		width: 280px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		font-size: 0.8rem;
		color: var(--color-text);
		overflow: hidden;
	}

	.dev-panel.collapsed {
		width: auto;
	}

	.dev-panel-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-subnav-bg);
		border: none;
		color: var(--color-text);
		font-weight: 700;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.chevron {
		color: var(--color-text-muted);
	}

	.dev-panel-body {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 60vh;
		overflow-y: auto;
	}

	h4 {
		margin: 0 0 0.35rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.6rem;
	}

	dt {
		color: var(--color-text-muted);
	}

	dd {
		margin: 0;
		text-align: right;
	}

	dd.good {
		color: var(--color-win);
	}

	dd.warn {
		color: var(--color-draw);
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		word-break: break-all;
	}

	.muted {
		color: var(--color-text-muted);
		margin: 0;
	}

	.flags-toggle {
		margin-top: 0.5rem;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		color: var(--color-accent);
		font-size: 0.72rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}

	.flag-list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 12rem;
		overflow-y: auto;
	}

	.flag-list li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		border-top: 1px solid var(--color-border);
		padding-top: 0.25rem;
	}

	.flag-key {
		color: var(--color-text-muted);
	}

	.flag-value {
		text-align: right;
		word-break: break-all;
	}
</style>
