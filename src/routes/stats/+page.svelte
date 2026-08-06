<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	function pct(n: number) {
		return `${Math.round(n * 100)}%`;
	}
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
	<table>
		<thead>
			<tr>
				<th>Team</th>
				<th>Games</th>
				<th>W</th>
				<th>L</th>
				<th>D</th>
				<th>Win rate</th>
			</tr>
		</thead>
		<tbody>
			{#each data.teamStats as t (t.teamName)}
				<tr>
					<td>{t.teamName}</td>
					<td>{t.games}</td>
					<td>{t.wins}</td>
					<td>{t.losses}</td>
					<td>{t.draws}</td>
					<td>{pct(t.winRate)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
