<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	// demoMode comes from the root layout load, merged into this page's data.
	let { data }: { data: PageData } = $props();
</script>

<h1>Challenger: A Home for Kill Team</h1>
<p>
	Log your matches, track your win rate with every team, and see how you stack up on the
	leaderboard.
</p>
<p style="display:flex; gap:0.75rem; flex-wrap:wrap;">
	<a class="button" href={resolve('/login')}>Login</a>
	{#if !data.demoMode}
		<a class="button-secondary" href={resolve('/register')}>Register</a>
	{/if}
</p>
