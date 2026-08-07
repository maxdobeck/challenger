<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	// Tournament dates are 'YYYY-MM-DD' strings; render as mm-dd-yyyy with no
	// timezone conversion.
	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-');
		return `${m}-${d}-${y}`;
	}

	function formatPlayedAt(d: string | Date) {
		return new Date(d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="tournaments-head">
	<h1>{data.tournament.name}</h1>
	<a class="button-secondary" href={resolve('/tournaments')}>Back to tournaments</a>
</div>

<div class="card stack">
	<p class="tournament-dates">
		{formatDate(data.tournament.startDate)} – {formatDate(data.tournament.endDate)}
	</p>
	<p>{data.tournament.location}</p>
	{#if data.tournament.address}
		<p class="muted">{data.tournament.address}</p>
	{/if}
	{#if data.tournament.details}
		<p>{data.tournament.details}</p>
	{/if}
</div>

<h2>Attendees <span class="muted">({data.attendees.length})</span></h2>
{#if data.attendees.length === 0}
	<p class="muted">No one has registered yet.</p>
{:else}
	<ul class="attendee-list">
		{#each data.attendees as a (a.id)}
			<li>{a.name}</li>
		{/each}
	</ul>
{/if}

<h2>Matches <span class="muted">({data.matches.length})</span></h2>
{#if data.matches.length === 0}
	<p class="muted">No matches have been logged for this tournament.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>Player 1</th>
				<th>Player 2</th>
				<th>Score</th>
				<th>Result</th>
			</tr>
		</thead>
		<tbody>
			{#each data.matches as m (m.id)}
				<tr>
					<td>{formatPlayedAt(m.playedAt)}</td>
					<td>{m.player1Name} <span class="muted">({m.player1TeamName})</span></td>
					<td>{m.player2Name} <span class="muted">({m.player2TeamName})</span></td>
					<td>{m.player1Total} - {m.player2Total}</td>
					<td>
						{#if m.result === 'p1'}
							{m.player1Name}
						{:else if m.result === 'p2'}
							{m.player2Name}
						{:else}
							Draw
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
