<script lang="ts">
	import type { PageServerData } from './$types';
	import SortableTable from '$lib/components/SortableTable.svelte';

	let { data }: { data: PageServerData } = $props();

	type TeamStat = (typeof data.teamStats)[number];

	function pct(n: number) {
		return `${Math.round(n * 100)}%`;
	}

	const columns = [
		{ key: 'team', label: 'Team', sortValue: (t: TeamStat) => t.teamName.toLowerCase() },
		{ key: 'games', label: 'Games', sortValue: (t: TeamStat) => t.games },
		{ key: 'wins', label: 'W', sortValue: (t: TeamStat) => t.wins },
		{ key: 'losses', label: 'L', sortValue: (t: TeamStat) => t.losses },
		{ key: 'draws', label: 'D', sortValue: (t: TeamStat) => t.draws },
		{ key: 'winRate', label: 'Win rate', sortValue: (t: TeamStat) => t.winRate }
	];
</script>

<h1>My Stats</h1>

<div class="card">
	{#if data.summary.totalGames === 0}
		<p class="muted">You haven't logged any matches yet. Head to Log Match to add one.</p>
	{:else}
		<p>
			<strong>{data.summary.totalGames}</strong> games played &middot;
			<strong>{pct(data.summary.winRate)}</strong> win rate &middot;
			{data.summary.totalWins}W / {data.summary.totalLosses}L / {data.summary.totalDraws}D
		</p>
		{#if data.summary.favoriteTeam}
			<p class="muted">Most played team: {data.summary.favoriteTeam}</p>
		{/if}
	{/if}
</div>

{#if data.teamStats.length > 0}
	<h2>By Team</h2>
	<SortableTable
		{columns}
		rows={data.teamStats}
		rowKey={(t) => t.teamName}
		defaultSortKey="games"
		defaultSortDirection="desc"
	>
		{#snippet cell(t, col)}
			{#if col.key === 'team'}
				{t.teamName}
			{:else if col.key === 'winRate'}
				{pct(t.winRate)}
			{:else if col.key === 'games'}
				{t.games}
			{:else if col.key === 'wins'}
				{t.wins}
			{:else if col.key === 'losses'}
				{t.losses}
			{:else if col.key === 'draws'}
				{t.draws}
			{/if}
		{/snippet}
	</SortableTable>
{/if}
