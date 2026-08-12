<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Combobox from '$lib/components/Combobox.svelte';
	import ScorePhotoScan from '$lib/components/ScorePhotoScan.svelte';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Category = 'crit' | 'tac' | 'kill';
	type PlayerScores = { crit: number; tac: number; kill: number; primaryOpChoice: Category | '' };

	let player1 = $state<PlayerScores>({ crit: 0, tac: 0, kill: 0, primaryOpChoice: '' });
	let player2 = $state<PlayerScores>({ crit: 0, tac: 0, kill: 0, primaryOpChoice: '' });

	function derivedPrimary(p: PlayerScores) {
		return p.primaryOpChoice ? Math.ceil(p[p.primaryOpChoice] / 2) : 0;
	}

	const player1Primary = $derived(derivedPrimary(player1));
	const player2Primary = $derived(derivedPrimary(player2));
	const player1Total = $derived(player1.crit + player1.tac + player1.kill + player1Primary);
	const player2Total = $derived(player2.crit + player2.tac + player2.kill + player2Primary);

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<h1>Log a Match</h1>

<div class="quick-upload-card card">
	<div>
		<strong>In a hurry?</strong>
		<p class="muted" style="margin: 0.25rem 0 0;">
			Scan a photo of your score tracker, or describe it in chat.
		</p>
	</div>
	<a href={resolve('/matches/quick-upload')} class="button-quick-upload"><em>Quick</em> Upload</a>
</div>

<div class="section-divider"><span>or log the match manually</span></div>

<form class="stack card" method="post" action="?/logMatch" use:enhance>
	<label>
		Opponent
		<Combobox items={data.opponents} name="opponentId" placeholder="Search opponents…" required />
	</label>
	<label>
		Tournament <span class="muted">(optional)</span>
		<Combobox items={data.tournaments} name="tournamentId" placeholder="Search tournaments…" />
	</label>

	<div class="form-row" style="gap:1.5rem;">
		<fieldset style="border:1px solid var(--color-border); border-radius:6px;">
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
			</div>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:flex-end;">
				<label style="flex:1; min-width:140px;">
					Primary Op
					<select name="player1PrimaryOpChoice" bind:value={player1.primaryOpChoice} required>
						<option value="" disabled>Choose…</option>
						<option value="crit">Crit</option>
						<option value="tac">Tac</option>
						<option value="kill">Kill</option>
					</select>
				</label>
				<div class="score-readout" style="flex:1; min-width:100px;">
					Primary (0-3)
					<div class="derived-score">{player1Primary}</div>
				</div>
			</div>
			<p class="muted" style="margin:0;">Total: <strong>{player1Total}</strong></p>
			<ScorePhotoScan
				groupName="You"
				onApply={(scores) => {
					player1.crit = scores.crit;
					player1.kill = scores.kill;
					player1.tac = scores.tac;
				}}
			/>
		</fieldset>

		<fieldset style="border:1px solid var(--color-border); border-radius:6px;">
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
			<ScorePhotoScan
				groupName="Opponent"
				onApply={(scores) => {
					player2.crit = scores.crit;
					player2.kill = scores.kill;
					player2.tac = scores.tac;
				}}
			/>
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
	<div class="table-scroll">
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
	</div>
{/if}
