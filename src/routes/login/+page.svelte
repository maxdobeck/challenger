<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let email = $state('');
	let password = $state('');

	// The dropdown selects which demo account the "Login as …" button signs in
	// as. Empty means "not yet chosen", so selectedAccount falls back to the
	// first curated account (Max).
	let selectedEmail = $state('');
	let demoOpen = $state(false);
	// Drives the purple flash on the "Login as …" button. Starts false so the
	// button does not animate on initial page load.
	let flashing = $state(false);

	const selectedAccount = $derived(
		data.demoAccounts.find((a) => a.email === selectedEmail) ?? data.demoAccounts[0]
	);
	const firstName = (name: string) => name.split(' ')[0];

	function selectAccount(accountEmail: string) {
		selectedEmail = accountEmail;
		demoOpen = false;
		// Restart the flash: drop the class, then re-add it on the next frame so
		// the browser replays the animation even when re-selecting the same account.
		flashing = false;
		requestAnimationFrame(() => {
			flashing = true;
		});
	}
</script>

<h1>Login</h1>
<p class="muted">Sign in to log matches and track your record.</p>

<form class="stack card" method="post" action="?/signInEmail" use:enhance>
	<label>
		Email
		<input type="email" name="email" bind:value={email} required autocomplete="email" />
	</label>
	<label>
		Password
		<input
			type="password"
			name="password"
			bind:value={password}
			required
			autocomplete="current-password"
		/>
	</label>
	<div style="display:flex; gap:0.75rem; flex-wrap: wrap;">
		<button type="submit">Login</button>
		{#if selectedAccount}
			<button
				type="submit"
				formaction="?/loginAs"
				formnovalidate
				name="loginAsEmail"
				value={selectedAccount.email}
				class="button login-as"
				class:flash={flashing}
				onanimationend={() => (flashing = false)}
				style="background:transparent; color:var(--color-text); border-color:var(--color-border);"
				>Login as {firstName(selectedAccount.name)}</button
			>
		{/if}
	</div>

	<details class="demo-accounts" bind:open={demoOpen}>
		<summary>Log in as a demo account</summary>
		<ul>
			{#each data.demoAccounts as account (account.email)}
				<li>
					<button
						type="button"
						class="demo-account"
						class:selected={account.email === selectedAccount.email}
						aria-pressed={account.email === selectedAccount.email}
						aria-label="Select {account.name}"
						onclick={() => selectAccount(account.email)}
					>
						<span class="demo-account-email">{account.email}</span>
						<span class="muted demo-account-name">{account.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	</details>

	{#if !data.demoMode}
		<p class="muted">Need an account? <a href={resolve('/register')}>Register</a></p>
	{/if}
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

{#if data.demoMode}
	<p class="muted">Demo mode — enter any demo account's email above, or pick one below (no password needed).</p>
{:else}
	<p class="muted">Seeded demo accounts use the password <code>password123</code>.</p>
{/if}

<style>
	.login-as {
		--color-flash: #7c3aed;
	}

	.login-as.flash {
		animation: flash-purple 600ms ease-out;
	}

	@keyframes flash-purple {
		0% {
			background: var(--color-flash);
			border-color: var(--color-flash);
			color: #fff;
		}
		35% {
			background: var(--color-flash);
			border-color: var(--color-flash);
			color: #fff;
		}
		100% {
			background: transparent;
			border-color: var(--color-border);
			color: var(--color-text);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.login-as.flash {
			animation: none;
		}
	}

	.demo-accounts {
		border: 1px solid var(--color-border);
		border-radius: 2px;
	}

	.demo-accounts summary {
		cursor: pointer;
		padding: 0.6rem 0.8rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		font-weight: 700;
	}

	.demo-accounts ul {
		list-style: none;
		margin: 0;
		padding: 0 0.4rem 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.demo-accounts .demo-account {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		width: 100%;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		text-transform: none;
		letter-spacing: normal;
		font-weight: 400;
	}

	.demo-accounts .demo-account:hover {
		background: var(--color-surface);
	}

	.demo-accounts .demo-account.selected {
		border-color: var(--color-accent);
	}

	.demo-account-email {
		font-weight: 700;
	}

	.demo-account-name {
		font-size: 0.8rem;
	}
</style>
