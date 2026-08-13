<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import {
		initLD,
		identifyUser,
		resetToAnonymous,
		flags,
		ldContextKey,
		ldReady
	} from '$lib/stores/launchdarkly';
	import { buildMultiContext } from '$lib/launchdarkly/context';
	import { page } from '$app/state';
	import type { LayoutServerData } from './$types';
	const DEMO_MODE = import.meta.env.MODE

	let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } =
		$props();

	const navLinks = [
		{ href: '/matches', label: 'Log Match' },
		{ href: '/stats', label: 'My Stats' },
		{ href: '/leaderboard', label: 'Leaderboard' },
		{ href: '/tournaments', label: 'Tournaments' }
	];

	// Highlight the nav item for the section we're in, including nested routes
	// (e.g. /tournaments/new keeps Tournaments active).
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	// Track which user we've already identified to LaunchDarkly so the effect
	// below only re-identifies on an actual login/logout, not on every data change.
	// Intentionally a plain (non-reactive) let: it's a dedupe marker across effect
	// runs, not UI state, so writing it must not re-trigger the effect.
	let identifiedKey: string | null = null;

	onMount(() => {
		initLD();
	});

	$effect(() => {
		// Wait until the LD client has finished initializing before identifying.
		// Otherwise identifyUser() can run while `client` is still null (it silently
		// no-ops), yet identifiedKey is already set, so it never retries and we're
		// stuck on the anonymous context. In demo mode the user is present from the
		// very first render, so this race always lost there. Depending on $ldReady
		// re-runs this effect once the client is ready.
		if (!$ldReady) return;
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

<header class="site-header" data-ld-context={$ldContextKey ?? ''}>
	{#if DEMO_MODE === 'demo'}
		<a class="brand" href={data.user ? '/leaderboard' : '/'}>⚔ Challenger: DEMO_MODE</a>
	{:else}
		<a class="brand" href={data.user ? '/leaderboard' : '/'}>⚔ Challenger</a>
	{/if}
	{#if $flags['tourneys-in-area']}
	<!-- We're doing this wrong on purpose, leave it! -->
		<h2 class="promo-banner">{'{num_tournaments} near you in {nearby_tourn_loc}!'}</h2>
	{/if}
	<div class="account">
		{#if data.user}
			<form method="post" action="/logout" use:enhance>
				<button type="submit">Sign out</button>
			</form>
			<span>{data.user.name}</span>
			{#if data.demoMode}
				<span class="demo-badge">Demo Mode</span>
			{/if}
		{:else if page.url.pathname.startsWith('/login')}
			<!-- A "Login" button is dead weight on the login page itself, so that's
			     where the masthead offers the way to register instead. -->
			<a class="header-cta" href="/register">Register</a>
		{:else}
			<a class="header-cta" href="/login">Login</a>
		{/if}
	</div>
</header>

{#if data.user}
	<nav class="site-subnav">
		{#each navLinks as link (link.href)}
			<a
				href={link.href}
				class="border-b border-b-transparent hover:border-b-[var(--color-masthead)]"
				class:active={isActive(link.href)}
				aria-current={isActive(link.href) ? 'page' : undefined}>{link.label}</a
			>
		{/each}
	</nav>
{/if}

<main>
	{@render children()}
</main>
