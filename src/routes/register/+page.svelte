<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		MIN_PASSWORD_LENGTH,
		validateRegistration,
		type RegistrationField
	} from '$lib/registration';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// Seeded from the rejected submission so values survive a no-JS POST, where the
	// page re-renders from scratch. untrack() is deliberate: on an enhanced failure
	// the inputs already hold what the user typed, and re-reading `form` would
	// overwrite it with the older submitted values.
	let name = $state(untrack(() => form?.values?.name ?? ''));
	let email = $state(untrack(() => form?.values?.email ?? ''));
	let password = $state('');
	let confirmPassword = $state('');

	let submitAttempted = $state(false);
	let touched = $state<Partial<Record<RegistrationField, boolean>>>({});

	// The same function the action runs, so the message shown before submitting is
	// the one the server would have produced.
	const clientErrors = $derived(validateRegistration({ name, email, password, confirmPassword }));
	const blocked = $derived(Object.keys(clientErrors).length > 0);

	// A field shows its client-side error once it's been touched or once submit has
	// been attempted. A server error shows only while the value the server rejected
	// is still in the box, so "that email is already registered" clears the moment
	// they start typing a different address instead of contradicting itself.
	function errorFor(field: RegistrationField): string | undefined {
		if (touched[field] || submitAttempted) {
			const client = clientErrors[field];
			if (client) return client;
		}
		const server = form?.errors?.[field];
		if (!server) return undefined;
		if (field === 'name' && name !== (form?.values?.name ?? '')) return undefined;
		if (field === 'email' && email !== (form?.values?.email ?? '')) return undefined;
		return server;
	}
</script>

<h1>Register</h1>
<p class="muted">Create an account to log matches and track your record.</p>

<form
	class="stack card"
	method="post"
	novalidate
	use:enhance={({ cancel }) => {
		// novalidate + our own validator, rather than native required/minlength:
		// the browser's validation bubbles preempt submission with their own
		// wording, which would contradict the messages below and can't be read by
		// a test. Cancelling here (rather than disabling the button) keeps the
		// button clickable, which is what surfaces the errors in the first place.
		submitAttempted = true;
		if (blocked) cancel();
	}}
>
	<label>
		Name
		<input
			name="name"
			bind:value={name}
			autocomplete="name"
			aria-invalid={errorFor('name') ? 'true' : undefined}
			aria-describedby={errorFor('name') ? 'name-error' : undefined}
			onblur={() => (touched.name = true)}
		/>
	</label>
	{#if errorFor('name')}
		<p class="field-error" id="name-error">{errorFor('name')}</p>
	{/if}

	<label>
		Email
		<input
			type="email"
			name="email"
			bind:value={email}
			autocomplete="email"
			aria-invalid={errorFor('email') ? 'true' : undefined}
			aria-describedby={errorFor('email') ? 'email-error' : undefined}
			onblur={() => (touched.email = true)}
		/>
	</label>
	{#if errorFor('email')}
		<p class="field-error" id="email-error">{errorFor('email')}</p>
	{/if}

	<label>
		Password
		<input
			type="password"
			name="password"
			bind:value={password}
			autocomplete="new-password"
			aria-invalid={errorFor('password') ? 'true' : undefined}
			aria-describedby={errorFor('password') ? 'password-error password-hint' : 'password-hint'}
			onblur={() => (touched.password = true)}
		/>
	</label>
	<!-- Outside the label so the field's accessible name stays exactly "Password". -->
	<p class="field-hint muted" id="password-hint">
		More than {MIN_PASSWORD_LENGTH - 1} characters.
	</p>
	{#if errorFor('password')}
		<p class="field-error" id="password-error">{errorFor('password')}</p>
	{/if}

	<label>
		Confirm password
		<input
			type="password"
			name="confirmPassword"
			bind:value={confirmPassword}
			autocomplete="new-password"
			aria-invalid={errorFor('confirmPassword') ? 'true' : undefined}
			aria-describedby={errorFor('confirmPassword') ? 'confirm-password-error' : undefined}
			onblur={() => (touched.confirmPassword = true)}
		/>
	</label>
	{#if errorFor('confirmPassword')}
		<p class="field-error" id="confirm-password-error">{errorFor('confirmPassword')}</p>
	{/if}

	<button type="submit">Create account</button>
</form>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<p class="muted">Already have an account? <a href={resolve('/login')}>Log in</a></p>

<style>
	/* Sits outside the <label> so it doesn't inherit the muted label colour that
	   form.stack label applies to its children. */
	.field-error {
		margin: -0.5rem 0 0;
		color: var(--color-loss);
		font-size: 0.8rem;
	}

	.field-hint {
		margin: -0.5rem 0 0;
		font-size: 0.8rem;
	}
</style>
