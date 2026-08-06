<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<h1>Log a Match</h1>

<form class="stack card" method="post" action="?/logMatch" use:enhance>
	<label>
		Opponent
		<select name="opponentId" required>
			<option value="" disabled selected>Select an opponent</option>
			{#each data.opponents as o (o.id)}
				<option value={o.id}>{o.name}</option>
			{/each}
		</select>
	</label>
	<label>
		Tournament <span class="muted">(optional)</span>
		<input name="tournament" placeholder="e.g. Winter Championship" />
	</label>

	<div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
		<fieldset style="flex:1; min-width:220px; border:1px solid var(--color-border); border-radius:6px;">
			<legend>You</legend>
			<label>
				Your team
				<select name="player1TeamId" required>
					<option value="" disabled selected>Select a team</option>
					{#each data.teams as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</label>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
				<label style="flex:1;">
					Crit (0-6)
					<input type="number" name="player1Crit" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Tac (0-6)
					<input type="number" name="player1Tac" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Kill (0-6)
					<input type="number" name="player1Kill" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Primary (0-3)
					<input type="number" name="player1Primary" min="0" max="3" value="0" />
				</label>
			</div>
		</fieldset>

		<fieldset style="flex:1; min-width:220px; border:1px solid var(--color-border); border-radius:6px;">
			<legend>Opponent</legend>
			<label>
				Opponent's team
				<select name="player2TeamId" required>
					<option value="" disabled selected>Select a team</option>
					{#each data.teams as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</label>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
				<label style="flex:1;">
					Crit (0-6)
					<input type="number" name="player2Crit" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Tac (0-6)
					<input type="number" name="player2Tac" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Kill (0-6)
					<input type="number" name="player2Kill" min="0" max="6" value="0" />
				</label>
				<label style="flex:1;">
					Primary (0-3)
					<input type="number" name="player2Primary" min="0" max="3" value="0" />
				</label>
			</div>
		</fieldset>
	</div>

	<button type="submit">Log match</button>
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<h2>Your match history</h2>
{#if data.matches.length === 0}
	<p class="muted">No matches logged yet — add your first one above.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>You</th>
				<th>Opponent</th>
				<th>Result</th>
				<th>Score</th>
				<th>Tournament</th>
			</tr>
		</thead>
		<tbody>
			{#each data.matches as m (m.id)}
				<tr>
					<td>{formatDate(m.playedAt)}</td>
					<td>{m.you.team} <span class="muted">({m.yourTotal} VP)</span></td>
					<td
						>{m.opponent.team} <span class="muted"
							>({m.opponent.name}, {m.opponentTotal} VP)</span
						></td
					>
					<td class="result-{m.result}">{m.result}</td>
					<td>{m.yourTotal} - {m.opponentTotal}</td>
					<td>{m.tournament ?? '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
