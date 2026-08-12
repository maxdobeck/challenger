<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import TeamRecordChart from '$lib/components/TeamRecordChart.svelte';

	let { data }: { data: PageServerData } = $props();

	type MatchRow = (typeof data.matches)[number];

	function pct(n: number) {
		return `${Math.round(n * 100)}%`;
	}

	function formatPlayedAt(d: string | Date) {
		return new Date(d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const columns = [
		{ key: 'date', label: 'Date', sortValue: (m: MatchRow) => m.playedAt.valueOf() },
		{
			key: 'opponentTeam',
			label: "Opponent's Team",
			sortValue: (m: MatchRow) => m.opponentTeamName.toLowerCase()
		},
		{ key: 'score', label: 'Score', sortValue: (m: MatchRow) => m.yourTotal - m.opponentTotal },
		{ key: 'result', label: 'Result', sortValue: (m: MatchRow) => m.result }
	];
</script>

<div class="tournaments-head">
	<h1>{data.team.name}</h1>
	{#if data.viewingOwnStats}
		<a class="button-secondary" href={resolve('/stats')}>Back to stats</a>
	{:else}
		<a class="button-secondary" href="{resolve('/stats')}?user={data.targetUserId}"
			>Back to stats</a
		>
	{/if}
</div>

{#if data.isMostPlayed}
	<p class="most-played-badge">
		{data.viewingOwnStats ? 'Your most-played team' : `${data.targetUserName}'s most-played team`}
	</p>
{/if}

<div class="card">
	{#if data.summary.games === 0}
		<p class="muted">
			{data.viewingOwnStats ? "You haven't" : `${data.targetUserName} hasn't`} logged any matches
			with this team yet.
		</p>
	{:else}
		<p>
			<strong>{data.summary.games}</strong> games played &middot;
			<strong>{pct(data.summary.winRate)}</strong> win rate &middot;
			{data.summary.wins}W / {data.summary.losses}L / {data.summary.draws}D
		</p>
	{/if}
</div>

{#if data.summary.games > 0}
	<h2>Record Over Time</h2>
	<TeamRecordChart data={data.chartData} />

	<h2>Matches</h2>
	<SortableTable
		{columns}
		rows={data.matches}
		rowKey={(m) => `${m.playedAt.valueOf()}-${m.opponentTeamId}`}
		defaultSortKey="date"
		defaultSortDirection="desc"
	>
		{#snippet cell(m, col)}
			{#if col.key === 'date'}
				{formatPlayedAt(m.playedAt)}
			{:else if col.key === 'opponentTeam'}
				{m.opponentTeamName}
			{:else if col.key === 'score'}
				{m.yourTotal} - {m.opponentTotal}
			{:else if col.key === 'result'}
				<span class="result-{m.result}">{m.result}</span>
			{/if}
		{/snippet}
	</SortableTable>
{/if}
