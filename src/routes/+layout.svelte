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
	<div class="account">
		{#if data.user}
			<span>{data.user.name}</span>
			<form method="post" action="/logout" use:enhance>
				<button type="submit">Sign out</button>
			</form>
		{:else}
			<a href="/login">Login</a>
		{/if}
	</div>
</header>

{#if data.user}
	<nav class="site-subnav">
		<a href="/matches">Log Match</a>
		<a href="/stats">My Stats</a>
		<a href="/leaderboard">Leaderboard</a>
	</nav>
{/if}

<main>
	{@render children()}
</main>
