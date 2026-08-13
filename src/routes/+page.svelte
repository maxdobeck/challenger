<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<h1>Challenger: A Home for Kill Team</h1>
<p>
	Log your matches, track your win rate with every team, and see how you stack up on the
	leaderboard.
</p>
<p style="display:flex; gap:0.75rem; flex-wrap:wrap;">
	<a class="button" href={resolve('/login')}>Login</a>
	<a class="button-secondary" href={resolve('/register')}>Register</a>
</p>
