<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	function pct(n: number) {
		return `${Math.round(n * 100)}%`;
	}
</script>

<h1>Leaderboard</h1>

{#if data.leaderboard.length === 0}
	<p class="muted">No matches logged yet.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Rank</th>
				<th>Player</th>
				<th>Games</th>
				<th>W</th>
				<th>L</th>
				<th>D</th>
				<th>Win rate</th>
				<th>Best Team</th>
			</tr>
		</thead>
		<tbody>
			{#each data.leaderboard as entry, i (entry.userId)}
				<tr
					class="{i === 0
						? 'rank-1'
						: ''} hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-[var(--color-masthead)]"
				>
					<td>{i + 1}</td>
					<td>
						{entry.userName}
						{#if entry.userId === data.currentUserId}<span class="muted"> (you)</span>{/if}
					</td>
					<td>{entry.games}</td>
					<td>{entry.wins}</td>
					<td>{entry.losses}</td>
					<td>{entry.draws}</td>
					<td>{pct(entry.winRate)}</td>
					<td>{entry.bestTeam ?? '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
