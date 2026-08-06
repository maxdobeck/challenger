<script lang="ts">
	import type { PageServerData } from './$types';
	import SortableTable from '$lib/components/SortableTable.svelte';

	let { data }: { data: PageServerData } = $props();

	type Entry = (typeof data.leaderboard)[number];

	function pct(n: number) {
		return `${Math.round(n * 100)}%`;
	}

	const columns = [
		{ key: 'player', label: 'Player', sortValue: (e: Entry) => e.userName.toLowerCase() },
		{ key: 'games', label: 'Games', sortValue: (e: Entry) => e.games },
		{ key: 'wins', label: 'W', sortValue: (e: Entry) => e.wins },
		{ key: 'losses', label: 'L', sortValue: (e: Entry) => e.losses },
		{ key: 'draws', label: 'D', sortValue: (e: Entry) => e.draws },
		{ key: 'winRate', label: 'Win rate', sortValue: (e: Entry) => e.winRate },
		{ key: 'bestTeam', label: 'Best Team', sortValue: (e: Entry) => e.bestTeam ?? '' }
	];
</script>

<h1>Leaderboard</h1>

{#if data.leaderboard.length === 0}
	<p class="muted">No matches logged yet.</p>
{:else}
	<SortableTable
		{columns}
		rows={data.leaderboard}
		rowKey={(e) => e.userId}
		rowClass={(_, i) =>
			`${i === 0 ? 'rank-1 ' : ''}hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-[var(--color-masthead)]`}
		showRank
		defaultSortKey="winRate"
		defaultSortDirection="desc"
	>
		{#snippet cell(entry, col)}
			{#if col.key === 'player'}
				{entry.userName}
				{#if entry.userId === data.currentUserId}<span class="muted"> (you)</span>{/if}
			{:else if col.key === 'winRate'}
				{pct(entry.winRate)}
			{:else if col.key === 'bestTeam'}
				{entry.bestTeam ?? '—'}
			{:else if col.key === 'games'}
				{entry.games}
			{:else if col.key === 'wins'}
				{entry.wins}
			{:else if col.key === 'losses'}
				{entry.losses}
			{:else if col.key === 'draws'}
				{entry.draws}
			{/if}
		{/snippet}
	</SortableTable>
{/if}
