<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { enhance } from '$app/forms';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } =
		$props();
</script>

<svelte:head>
	<title>Challenger</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<a class="brand" href={data.user ? '/leaderboard' : '/'}>⚔ Challenger</a>
	{#if data.user}
		<nav>
			<a href="/matches">Log Match</a>
			<a href="/stats">My Stats</a>
			<a href="/leaderboard">Leaderboard</a>
			<span class="muted" style="color: rgba(255,255,255,0.85)">{data.user.name}</span>
			<form method="post" action="/logout" use:enhance>
				<button type="submit">Sign out</button>
			</form>
		</nav>
	{:else}
		<nav>
			<a href="/login">Login</a>
		</nav>
	{/if}
</header>

<main>
	{@render children()}
</main>
