<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ScoreChat from '$lib/components/ScoreChat.svelte';
	import TournamentCombobox from '$lib/components/TournamentCombobox.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let player1 = $state({ crit: 0, tac: 0, kill: 0, primary: 0, primaryOpChoice: '' });
	let player2 = $state({ crit: 0, tac: 0, kill: 0, primary: 0 });
	let submitError = $state<string | null>(null);
</script>

<h1>Quick Upload</h1>
<p class="muted">Scan a photo of your score tracker, or describe it — then confirm to log the match.</p>

<ScoreChat
	onConfirm={(result) => {
		player1.crit = result.crit;
		player1.kill = result.kill;
		player1.tac = result.tac;
		player1.primary = result.primary;
		player1.primaryOpChoice = result.primaryOpChoice;
	}}
/>

<form
	class="stack card"
	method="post"
	action="/matches?/logMatch"
	use:enhance={() => {
		return async ({ result }) => {
			if (result.type === 'success') {
				await goto(resolve('/matches'));
			} else if (result.type === 'failure') {
				submitError = (result.data?.message as string) ?? 'Could not log the match.';
			}
		};
	}}
>
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
		<TournamentCombobox tournaments={data.tournaments} name="tournamentId" />
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
					<input type="number" name="player1Crit" min="0" max="6" bind:value={player1.crit} />
				</label>
				<label style="flex:1;">
					Tac (0-6)
					<input type="number" name="player1Tac" min="0" max="6" bind:value={player1.tac} />
				</label>
				<label style="flex:1;">
					Kill (0-6)
					<input type="number" name="player1Kill" min="0" max="6" bind:value={player1.kill} />
				</label>
				<label style="flex:1;">
					Primary (0-3)
					<input type="number" name="player1Primary" min="0" max="3" bind:value={player1.primary} />
				</label>
			</div>
			<input type="hidden" name="player1PrimaryOpChoice" value={player1.primaryOpChoice} />
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
					<input type="number" name="player2Crit" min="0" max="6" bind:value={player2.crit} />
				</label>
				<label style="flex:1;">
					Tac (0-6)
					<input type="number" name="player2Tac" min="0" max="6" bind:value={player2.tac} />
				</label>
				<label style="flex:1;">
					Kill (0-6)
					<input type="number" name="player2Kill" min="0" max="6" bind:value={player2.kill} />
				</label>
				<label style="flex:1;">
					Primary (0-3)
					<input type="number" name="player2Primary" min="0" max="3" bind:value={player2.primary} />
				</label>
			</div>
		</fieldset>
	</div>

	<button type="submit">Log match</button>
	{#if submitError}
		<p class="error">{submitError}</p>
	{/if}
</form>
