<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let email = $state('');
	let password = $state('');

	// The dropdown selects which demo account the "Login as …" button signs in
	// as. Empty means "not yet chosen", so selectedAccount falls back to the
	// first curated account (Max).
	let selectedEmail = $state('');
	let demoOpen = $state(false);

	const selectedAccount = $derived(
		data.demoAccounts.find((a) => a.email === selectedEmail) ?? data.demoAccounts[0]
	);
	const firstName = (name: string) => name.split(' ')[0];

	function selectAccount(accountEmail: string) {
		selectedEmail = accountEmail;
		demoOpen = false;
	}
</script>

<h1>Login</h1>
<p class="muted">Sign in with an existing account, or register a new one below.</p>

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
	<label>
		Name <span class="muted">(only needed to register)</span>
		<input name="name" autocomplete="name" />
	</label>
	<div style="display:flex; gap:0.75rem; flex-wrap: wrap;">
		<button type="submit">Login</button>
		<button
			type="submit"
			formaction="?/signUpEmail"
			class="button"
			style="background:transparent; color:var(--color-text); border-color:var(--color-border);"
			>Register</button
		>
		{#if selectedAccount}
			<button
				type="submit"
				formaction="?/loginAs"
				formnovalidate
				name="loginAsEmail"
				value={selectedAccount.email}
				class="button"
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
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<p class="muted">Seeded demo accounts use the password <code>password123</code>.</p>

<style>
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
