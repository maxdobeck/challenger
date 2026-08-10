<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { initLD, identifyUser, resetToAnonymous } from '$lib/stores/launchdarkly';
	import { buildMultiContext } from '$lib/launchdarkly/context';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } =
		$props();

	// Track which user we've already identified to LaunchDarkly so the effect
	// below only re-identifies on an actual login/logout, not on every data change.
	// Intentionally a plain (non-reactive) let: it's a dedupe marker across effect
	// runs, not UI state, so writing it must not re-trigger the effect.
	let identifiedKey: string | null = null;

	onMount(() => {
		initLD();
	});

	$effect(() => {
		if (data.user && identifiedKey !== data.user.id) {
			identifiedKey = data.user.id;
			identifyUser(
				buildMultiContext(
					{ id: data.user.id, name: data.user.name, email: data.user.email },
					data.profile
				)
			);
		} else if (!data.user && identifiedKey !== null) {
			identifiedKey = null;
			resetToAnonymous();
		}
	});
</script>

<svelte:head>
	<title>Challenger</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<a class="brand" href={data.user ? '/leaderboard' : '/'}>⚔ Challenger</a>
	<div class="account">
		{#if data.user}
			{#if data.demoMode}
				<span>{data.user.name}</span>
				<span class="demo-badge">Demo Mode</span>
			{:else}
				<form method="post" action="/logout" use:enhance>
					<button type="submit">Sign out</button>
				</form>
				<span>{data.user.name}</span>
			{/if}
		{:else}
			<a href="/login">Login</a>
		{/if}
	</div>
</header>

{#if data.user}
	<nav class="site-subnav">
		<a
			href="/matches"
			class="border-b border-b-transparent hover:border-b-[var(--color-masthead)]"
			>Log Match</a
		>
		<a
			href="/stats"
			class="border-b border-b-transparent hover:border-b-[var(--color-masthead)]"
			>My Stats</a
		>
		<a
			href="/leaderboard"
			class="border-b border-b-transparent hover:border-b-[var(--color-masthead)]"
			>Leaderboard</a
		>
		<a
			href="/tournaments"
			class="border-b border-b-transparent hover:border-b-[var(--color-masthead)]"
			>Tournaments</a
		>
	</nav>
{/if}

<main>
	{@render children()}
</main>
