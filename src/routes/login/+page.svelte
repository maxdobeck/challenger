<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<h1>Login</h1>
<p class="muted">Sign in with an existing account, or register a new one below.</p>

<form class="stack card" method="post" action="?/signInEmail" use:enhance>
	<label>
		Email
		<input type="email" name="email" required autocomplete="email" />
	</label>
	<label>
		Password
		<input type="password" name="password" required autocomplete="current-password" />
	</label>
	<label>
		Name <span class="muted">(only needed to register)</span>
		<input name="name" autocomplete="name" />
	</label>
	<div style="display:flex; gap:0.75rem;">
		<button type="submit">Login</button>
		<button
			type="submit"
			formaction="?/signUpEmail"
			class="button"
			style="background:transparent; color:var(--color-text); border-color:var(--color-border);"
			>Register</button
		>
	</div>
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<p class="muted">Seeded demo accounts use the password <code>password123</code>.</p>
