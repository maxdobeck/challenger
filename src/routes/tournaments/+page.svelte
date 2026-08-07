<script lang="ts">
	import Fuse from 'fuse.js';
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const PAGE_SIZE = 50;

	let query = $state('');
	let page = $state(0);
	// Set when the user presses Enter: show every match at once instead of a
	// single 50-item page.
	let showAll = $state(false);

	const fuse = $derived(new Fuse(data.tournaments, { keys: ['name'], threshold: 0.4 }));
	const filtered = $derived(
		query.trim() ? fuse.search(query).map((r) => r.item) : data.tournaments
	);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const visible = $derived(
		showAll ? filtered : filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
	);

	function onInput() {
		// Any edit re-enters paged mode from the top.
		showAll = false;
		page = 0;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			showAll = true;
		}
	}

	// Dates are stored as 'YYYY-MM-DD' strings; render as mm-dd-yyyy without any
	// timezone conversion.
	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-');
		return `${m}-${d}-${y}`;
	}
</script>

<div class="tournaments-head">
	<h1>Tournaments</h1>
	<a class="button" href={resolve('/tournaments/new')}>Create tournament</a>
</div>

<input
	class="tournament-search"
	type="search"
	placeholder="Search tournaments…"
	aria-label="Search tournaments"
	bind:value={query}
	oninput={onInput}
	onkeydown={onKeydown}
/>

<p class="muted" data-testid="result-count">
	{filtered.length}
	{query.trim() ? (filtered.length === 1 ? 'match' : 'matches') : 'tournaments'}
	{#if !showAll && !query.trim() && pageCount > 1}
		<span>· page {page + 1} of {pageCount}</span>
	{/if}
</p>

{#snippet pagination()}
	{#if !showAll && pageCount > 1}
		<div class="pagination">
			<button type="button" disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>
				Previous
			</button>
			<span>Page {page + 1} of {pageCount}</span>
			<button
				type="button"
				disabled={page >= pageCount - 1}
				onclick={() => (page = Math.min(pageCount - 1, page + 1))}
			>
				Next
			</button>
		</div>
	{/if}
{/snippet}

{#if filtered.length === 0}
	<p class="muted">No tournaments match “{query}”.</p>
{:else}
	{@render pagination()}

	<div class="tournament-grid">
		{#each visible as t (t.id)}
			<a class="tournament-card" href={resolve('/tournaments/[id]', { id: String(t.id) })}>
				<h3>{t.name}</h3>
				<p class="tournament-dates">{formatDate(t.startDate)} – {formatDate(t.endDate)}</p>
				<p class="muted">{t.location}</p>
				<p class="tournament-attendees">
					{t.attendees}
					{t.attendees === 1 ? 'attendee' : 'attendees'}
				</p>
			</a>
		{/each}
	</div>

	{@render pagination()}
{/if}
