<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Combobox from '$lib/components/Combobox.svelte';
	import ScoreChat from '$lib/components/ScoreChat.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Category = 'crit' | 'tac' | 'kill';

	let player1 = $state({ crit: 0, tac: 0, kill: 0, primary: 0, primaryOpChoice: '' });
	let player2 = $state<{ crit: number; tac: number; kill: number; primaryOpChoice: Category | '' }>({
		crit: 0,
		tac: 0,
		kill: 0,
		primaryOpChoice: ''
	});
	let submitError = $state<string | null>(null);

	function derivedPrimary(p: { crit: number; tac: number; kill: number; primaryOpChoice: Category | '' }) {
		return p.primaryOpChoice ? Math.ceil(p[p.primaryOpChoice] / 2) : 0;
	}

	const player2Primary = $derived(derivedPrimary(player2));
	const player2Total = $derived(player2.crit + player2.tac + player2.kill + player2Primary);
</script>

<h1>Quick Upload</h1>
<p class="muted">
	Chat through both players' scores — send a photo or describe them — then confirm to log the match.
</p>

<ScoreChat
	onConfirm={(result) => {
		player1.crit = result.you.crit;
		player1.kill = result.you.kill;
		player1.tac = result.you.tac;
		player1.primary = result.you.primary;
		player1.primaryOpChoice = result.you.primaryOpChoice;
		player2.crit = result.opponent.crit;
		player2.kill = result.opponent.kill;
		player2.tac = result.opponent.tac;
		player2.primaryOpChoice = result.opponent.primaryOpChoice;
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
		<Combobox items={data.opponents} name="opponentId" placeholder="Search opponents…" required />
	</label>
	<label>
		Tournament <span class="muted">(optional)</span>
		<Combobox items={data.tournaments} name="tournamentId" placeholder="Search tournaments…" />
	</label>

	<div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
		<fieldset style="flex:1; min-width:220px; border:1px solid var(--color-border); border-radius:6px;">
			<legend>You</legend>
			<label>
				Your team
				<Combobox items={data.teams} name="player1TeamId" placeholder="Search teams…" required />
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
				<Combobox items={data.teams} name="player2TeamId" placeholder="Search teams…" required />
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
			</div>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:flex-end;">
				<label style="flex:1; min-width:140px;">
					Primary Op
					<select name="player2PrimaryOpChoice" bind:value={player2.primaryOpChoice} required>
						<option value="" disabled>Choose…</option>
						<option value="crit">Crit</option>
						<option value="tac">Tac</option>
						<option value="kill">Kill</option>
					</select>
				</label>
				<div class="score-readout" style="flex:1; min-width:100px;">
					Primary (0-3)
					<div class="derived-score">{player2Primary}</div>
				</div>
			</div>
			<p class="muted" style="margin:0;">Total: <strong>{player2Total}</strong></p>
		</fieldset>
	</div>

	<button type="submit">Log match</button>
	{#if submitError}
		<p class="error">{submitError}</p>
	{/if}
</form>
