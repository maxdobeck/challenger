<script lang="ts">
	import type { PageServerData } from './$types';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import { flags } from '$lib/stores/launchdarkly';

	let { data }: { data: PageServerData } = $props();

	// Reports the unfinished feature to LaunchDarkly Observability with an
	// explicit message and component context, rather than throwing an uncaught
	// error. LDObserve lives in the observability chunk that initLD() already
	// loaded, so this dynamic import resolves from cache and stays out of the
	// page's initial bundle. Add `throw error` after if you also want the UI
	// to visibly break.
	async function matchmake() {
		const error = new Error("OOPS this feature isn't working :(");
		const { LDObserve } = await import('@launchdarkly/observability');
		LDObserve.recordError(error, 'Matchmake Now is not implemented yet', {
			component: 'leaderboard/+page.svelte'
		});
	}

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

{#if $flags['social-matchmake']}
	<p><button type="button" class="button" onclick={matchmake}>Matchmake Now!</button></p>
{/if}

{#if data.leaderboard.length === 0}
	<p class="muted">No matches logged yet.</p>
{:else}
	<SortableTable
		{columns}
		rows={data.leaderboard}
		rowKey={(e) => e.userId}
		rowClass={(_, i) => (i === 0 ? 'rank-1' : '')}
		showRank
		defaultSortKey="winRate"
		defaultSortDirection="desc"
	>
		{#snippet cell(entry, col)}
			{#if col.key === 'player'}
				<a href="/stats?user={entry.userId}">{entry.userName}</a>
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
