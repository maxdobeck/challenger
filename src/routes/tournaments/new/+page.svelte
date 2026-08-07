<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="tournaments-head">
	<h1>Create Tournament</h1>
	<a class="button-secondary" href={resolve('/tournaments')}>Back to tournaments</a>
</div>

<form class="stack card" method="post" action="?/create" use:enhance>
	<label>
		Name
		<input name="name" required placeholder="e.g. Winter Championship" />
	</label>

	<div style="display:flex; gap:1rem; flex-wrap:wrap;">
		<label style="flex:1; min-width:160px;">
			Start date
			<input type="date" name="startDate" required />
		</label>
		<label style="flex:1; min-width:160px;">
			End date
			<input type="date" name="endDate" required />
		</label>
	</div>

	<label>
		Location
		<input name="location" required placeholder="e.g. Frostgate Convention Center" />
	</label>

	<label>
		Address <span class="muted">(optional)</span>
		<input name="address" placeholder="Street, City, State ZIP" />
	</label>

	<label>
		Details <span class="muted">(optional)</span>
		<textarea name="details" rows="4" placeholder="Format, rounds, rules pack…"></textarea>
	</label>

	<button type="submit">Create tournament</button>
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}
