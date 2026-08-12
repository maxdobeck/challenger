<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Combobox from '$lib/components/Combobox.svelte';
	import ScoreChat, { type ScoreDraft } from '$lib/components/ScoreChat.svelte';
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

	// Live, in-progress readings from each side's chat -- distinct from
	// player1/player2 (which only update once a side's chat is actually
	// Confirmed) so the header below can show what's being discussed *right
	// now* without that preview getting wiped the instant a chat resets after
	// Confirm (see ScoreChat's onDraftChange doc comment).
	let player1Draft = $state<ScoreDraft | null>(null);
	let player2Draft = $state<ScoreDraft | null>(null);

	function derivedPrimary(p: { crit: number; tac: number; kill: number; primaryOpChoice: Category | '' }) {
		return p.primaryOpChoice ? Math.ceil(p[p.primaryOpChoice] / 2) : 0;
	}

	const player2Primary = $derived(derivedPrimary(player2));
	// Committed-only (no draft blending) -- this is what the manual-entry
	// fieldset below has always shown, and it should keep matching the
	// individual number inputs there rather than jumping ahead of them while
	// a chat is still in progress.
	const player2Total = $derived(player2.crit + player2.tac + player2.kill + player2Primary);

	// Draft-aware versions for the header only: prefer the live draft (chat
	// in progress) and fall back to the last Confirmed value once the chat
	// resets, so the header always shows the most current reading for each
	// side, whether or not the user has hit Confirm yet. Deliberately kept
	// separate from player1/player2 above so the manual-entry form below
	// isn't affected by in-progress chat state.
	const player1HeaderDisplay = $derived({
		crit: player1Draft?.crit ?? player1.crit,
		kill: player1Draft?.kill ?? player1.kill,
		tac: player1Draft?.tac ?? player1.tac,
		primary: player1Draft?.primary ?? player1.primary
	});
	const player1HeaderTotal = $derived(
		player1HeaderDisplay.crit + player1HeaderDisplay.kill + player1HeaderDisplay.tac + player1HeaderDisplay.primary
	);

	const player2HeaderDisplay = $derived({
		crit: player2Draft?.crit ?? player2.crit,
		kill: player2Draft?.kill ?? player2.kill,
		tac: player2Draft?.tac ?? player2.tac,
		primary: player2Draft?.primary ?? player2Primary
	});
	const player2HeaderTotal = $derived(
		player2HeaderDisplay.crit + player2HeaderDisplay.kill + player2HeaderDisplay.tac + player2HeaderDisplay.primary
	);
</script>

<h1>Quick Upload</h1>
<p class="muted">
	Scan a photo of your score tracker, or describe it — then do the same for your opponent. The
	draft score below updates as you go; confirm both to log the match.
</p>

<div class="card stack draft-score">
	<h2>Draft Score</h2>
	<div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
		<div style="flex:1; min-width:160px;" data-testid="draft-score-you">
			<h3>You</h3>
			<p class="muted" style="margin:0;">
				Crit {player1HeaderDisplay.crit} · Kill {player1HeaderDisplay.kill} · Tac {player1HeaderDisplay.tac} · Primary {player1HeaderDisplay.primary}
			</p>
			<p style="margin:0;">Total: <strong>{player1HeaderTotal}</strong></p>
		</div>
		<div style="flex:1; min-width:160px;" data-testid="draft-score-opponent">
			<h3>Opponent</h3>
			<p class="muted" style="margin:0;">
				Crit {player2HeaderDisplay.crit} · Kill {player2HeaderDisplay.kill} · Tac {player2HeaderDisplay.tac} · Primary {player2HeaderDisplay.primary}
			</p>
			<p style="margin:0;">Total: <strong>{player2HeaderTotal}</strong></p>
		</div>
	</div>
</div>

<section aria-label="Your score chat" class="stack">
	<h3>You</h3>
	<ScoreChat
		onDraftChange={(draft) => (player1Draft = draft)}
		onConfirm={(result) => {
			player1.crit = result.crit;
			player1.kill = result.kill;
			player1.tac = result.tac;
			player1.primary = result.primary;
			player1.primaryOpChoice = result.primaryOpChoice;
		}}
	/>
</section>

<section aria-label="Opponent's score chat" class="stack">
	<h3>Opponent</h3>
	<ScoreChat
		onDraftChange={(draft) => (player2Draft = draft)}
		onConfirm={(result) => {
			player2.crit = result.crit;
			player2.kill = result.kill;
			player2.tac = result.tac;
			player2.primaryOpChoice = result.primaryOpChoice;
		}}
	/>
</section>

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
