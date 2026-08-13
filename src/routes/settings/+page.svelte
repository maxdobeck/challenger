<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const CONFIRM_TEXT = 'delete';

	let confirmText = $state('');
	let confirmChecked = $state(false);

	const canDelete = $derived(confirmText === CONFIRM_TEXT && confirmChecked);
</script>

<h1>Settings</h1>

<section class="card danger-zone">
	<h2>Danger Zone</h2>

	{#if data.isCuratedDemoAccount}
		<p class="muted">
			This is a shared demo account and can't be deleted. Register a temporary account from the
			login page to try account deletion.
		</p>
	{:else}
		<p>
			Deleting your account permanently removes your match history, team assignments, and
			tournament registrations. Tournaments you created will remain but will no longer show you
			as the creator. This cannot be undone.
		</p>

		<form class="stack" method="post" action="?/deleteAccount" use:enhance>
			<label>
				Type <strong>delete</strong> to confirm
				<input
					type="text"
					name="confirmText"
					bind:value={confirmText}
					autocomplete="off"
					aria-label="Type delete to confirm"
				/>
			</label>
			<label class="checkbox-row">
				<input type="checkbox" name="confirmChecked" bind:checked={confirmChecked} />
				I understand this is permanent and cannot be undone.
			</label>
			<button type="submit" class="button-danger" disabled={!canDelete}>Delete my data</button>
		</form>

		{#if form?.message}
			<p class="error">{form.message}</p>
		{/if}
	{/if}
</section>
