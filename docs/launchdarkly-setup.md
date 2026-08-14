# Recreating the LaunchDarkly setup

Everything the app reads from LaunchDarkly lives in one project, **`challenger`**, with
the two default environments (**Production** and **Test**). This is a from-scratch
recipe: follow it in order and you end up with the same flags, segments, and AI Configs
the deployed demo runs on. Every value here was read back out of the live project, so it
is what the app actually evaluates against — not an idealized version.

## The short version (for AI / the LaunchDarkly MCP server)

Paste this into an agent with the LaunchDarkly MCP server connected and it can build most
of the project unattended. Project key `challenger`, environments `production` and `test`.
All three flags are boolean, temporary, with client-side SDK availability **on** (both
client-side ID and mobile key), and all three are **off in `test`** — the block below
describes `production` only.

```yaml
segments:                       # production; rule-based, no individual members
  non-tournament-players:       # tag: tournament-push
    rule: user.hasPlayedTournament is one of [false]   # boolean false, not "false"
  debug:
    rule: user.email contains "challenger"

flags:                          # boolean, temporary, client-side availability on
  tourneys-in-area:
    on: true
    targets:  { user LVjW4rp4DK1T4Aj7cyHm3LuOKRDHO1hr: true }
    rules:
      - user.email contains "challenger"        -> true
      - context is in segment non-tournament-players -> true
    fallthrough: false
    offVariation: false
  social-matchmake:
    on: true
    rules:
      - context is in segment non-tournament-players -> 50/50 experiment rollout
        # created by starting the social-matchmake-cta experiment, not by hand
    fallthrough: false
    offVariation: false
  debug-mode:
    on: true
    rules:
      - context is in segment debug -> true
    fallthrough: false
    offVariation: false

ai_configs:
  score-chat:                   # mode: agent
    variations:
      score-chatting-bot: { model: Anthropic.claude-haiku-4-5-20251001 }
      picture-first:      { model: Anthropic.claude-opus-4-8 }
      cheapest-api:       { model: Anthropic.claude-sonnet-4-5 }
    targeting_production:
      enabled: true
      targets: { user demo-test1: picture-first }
      rule: context.kind is one of [user] -> rollout
            { disabled: 0%, score-chatting-bot: 50%, picture-first: 25%, cheapest-api: 25% }
      fallthrough: score-chatting-bot
      offVariation: disabled
    targeting_test: { enabled: true, fallthrough: disabled, offVariation: disabled }
  score-photo-scan:             # mode: completion, one `default` variation
    model: Anthropic.claude-haiku-4-5-20251001
    targeting: enabled in both envs, default rule -> default
  score-text-parse:             # mode: completion, one `default` variation
    model: Anthropic.claude-haiku-4-5-20251001
    targeting: enabled in both envs, default rule -> default
```

Instruction and prompt text for the AI Configs is in [section 5](#5-ai-configs) below —
copy it verbatim, since two of the prompts are duplicated as in-code fallbacks. Section 5
also covers the four judges and the sampling rates they're attached to `score-chat` with,
which this summary leaves out.

**What the MCP server cannot do:** it exposes writes for feature flags and AI Configs
only. **Segments, metrics, and experiments have no MCP tools**, so create those three by
hand in the UI (sections 1, 3, and 4) — and create the segments *first*, or the flag rules
above have nothing to reference. There are no read tools either, so verify with the REST
calls at the end.

## The long version

Order matters in three places: segments must exist before the flag rules that reference
them, the click metric must exist before the experiment that measures it, and the judge
AI Configs must exist before you can attach them to the `score-chat` variations.

## 0. Project and environments

1. **Create a project.** Account settings → Projects → **Create project**. Name it
   `Challenger`; the key must be `challenger` — the app's SDK keys are per-environment,
   but every REST path and script in `scripts/` uses that project key.
2. Keep the two environments LaunchDarkly creates for you: **Production** (`production`)
   and **Test** (`test`). Nothing in the repo needs a third.
3. Copy the credentials into `.env`:
   - Production **client-side ID** → `PUBLIC_LD_CLIENT_ID`
   - Production **SDK key** → `LAUNCHDARKLY_SDK_KEY`

**Context kinds** need no manual step. The project ends up with `user`, `device`, and
`request`; `user` is built in, and the other two get registered automatically the first
time the SDKs send them. `device` comes from the browser multi-context in
[`src/lib/launchdarkly/context.ts`](../src/lib/launchdarkly/context.ts), `request` from
the observability plugin.

The `user` context the app sends carries the attributes every rule below depends on:
`key` (the user id), `name`, `email` (marked private), `hasPlayedTournament`, and
`totalMatches`. Server-side evaluation sends a `user`-only context
([`src/lib/server/ai/context.ts`](../src/lib/server/ai/context.ts)); the browser sends a
multi-context of `user` + `device`.

## 1. Segments

Both segments are rule-based (no individually-listed members) and live in **Production**.
Create them under **Segments → Create segment → Rule-based**.

**`non-tournament-players`** — "Players who have not played in a tournament."
Tag: `tournament-push`.

| | |
|---|---|
| Rule 1 | Context kind `user`, attribute `hasPlayedTournament`, operator **is one of**, value `false` (boolean, not the string) |

This is the audience for the whole tournament-push story: everyone who has only ever
played casual matches. The seed data is built to keep a healthy slice of players in it —
see the comments in [`src/lib/server/db/seed.ts`](../src/lib/server/db/seed.ts).

**`debug`** — "need a way to debug"

| | |
|---|---|
| Rule 1 | Context kind `user`, attribute `email`, operator **contains**, value `challenger` |

Any signed-in account whose email contains `challenger` is a developer for targeting
purposes.

## 2. Feature flags

All three are **boolean**, marked **temporary**, with the default `true`/`false`
variations, and all three have **client-side SDK availability** turned on (both "SDKs
using client-side ID" and "SDKs using mobile key") — the app evaluates them in the
browser, so without that they silently return the code default.

For each: **Flags → Create flag**, set the key, name, and description, leave the
variations at the boolean default, tick client-side availability, then configure
targeting per environment.

**`tourneys-in-area`** — name `tourneys-in-area`, description "nearby tournaments
happening soon(within 90days)". Read in
[`src/routes/+layout.svelte:82`](../src/routes/+layout.svelte#L82).

Production targeting — **On**:

1. **Individual target:** user key `LVjW4rp4DK1T4Aj7cyHm3LuOKRDHO1hr` → `true`
   (one specific demo account, pinned on regardless of the rules below)
2. **Rule:** `email` **contains** `challenger` → serve `true`
3. **Rule:** context **is in segment** `non-tournament-players` → serve `true`
4. **Default rule (fallthrough):** `false`
5. **Off variation:** `false`

Test targeting: **Off**, off variation `false`. Same for the other two flags — Test is
left untouched everywhere, so a test-environment SDK key gives you the off state of the
entire project.

**`social-matchmake`** — name `Social Matchmake`, description "CTA to get matchmaking
happen and move games out of kitchens and into networking friendly halls." Read in
[`src/routes/leaderboard/+page.svelte:11`](../src/routes/leaderboard/+page.svelte#L11) and
[`src/routes/stats/+page.svelte:12`](../src/routes/stats/+page.svelte#L12).

Production targeting — **On**:

1. **Rule:** context **is in segment** `non-tournament-players` → **this rule is the
   experiment's audience; don't set a plain variation on it.** Its rollout is created for
   you in step 4 when you start the experiment, which converts the rule to a 50/50
   experiment allocation randomized by `user`, with re-shuffling disabled.
2. **Default rule:** `false`
3. **Off variation:** `false`

The practical sequence is: create the flag with the segment rule serving `false`, then
build the experiment and point it at this rule. LaunchDarkly rewrites the rule into the
split.

**`debug-mode`** — name `debug mode`, description "developers with challenger email
domains can access debug tools". Gates the dev control panel
([`src/routes/+layout.svelte:42`](../src/routes/+layout.svelte#L42)).

Production targeting — **On**:

1. **Rule:** context **is in segment** `debug` → serve `true`
2. **Default rule:** `false`
3. **Off variation:** `false`

## 3. Metric

One hand-made metric. **Metrics → Create metric**:

- **Key / name:** `matchmake-click-rate`
- **Event kind:** **Click** (LaunchDarkly's no-code click tracking — no `track()` call in
  the app)
- **CSS selector:** `#matchmake-now`
- **Target URLs:**
  - Canonical `https://challenger-phi.vercel.app/leaderboard`
  - Canonical `https://localhost`
  - Substring contains `/leaderboard`
- **Randomization unit:** `user`; analysis **mean**, success = higher

That selector is load-bearing: the "Matchmake Now!" button carries `id="matchmake-now"`
in both `leaderboard/+page.svelte` and `stats/+page.svelte`. Renaming the id zeroes the
metric out with no error anywhere.

You will also see ~48 metrics prefixed `ld_autogen__` (TTFB, FCP, LCP, INP, FID, error
and 5xx rates, request latency). **Do not create these by hand** — LaunchDarkly generates
them when the Observability plugins start reporting, which the app does from both
[`src/lib/stores/launchdarkly.ts`](../src/lib/stores/launchdarkly.ts) and
[`src/lib/server/ai/ldClient.ts`](../src/lib/server/ai/ldClient.ts).

## 4. Experiment

**`social-matchmake-cta`** (running). **Experiments → Create experiment**:

- **Hypothesis:** "If I see the CTA to play more matches it will prompt me to attend more
  tournaments."
- **Type:** Feature change
- **Randomization unit:** `user`
- **Primary metric:** `matchmake-click-rate`
- **Flag:** `social-matchmake`, attached to the `non-tournament-players` **rule** (not the
  default rule)
- **Variations:** `true` / `false`, 50/50, re-shuffling off, CUPED off
- **Not-in-experiment variation:** `true`

Then **Start** the iteration. Only users who match the segment are enrolled; everyone
else falls through to `false`.

## 5. AI Configs

Seven AI Configs, in three groups. Build them in this order: judges first, then the
completion configs, then the agent — the agent's variations reference the judges by key.

Model identifiers used across all of them: `Anthropic.claude-haiku-4-5-20251001`,
`Anthropic.claude-sonnet-4-5`, and `Anthropic.claude-opus-4-8`.

### 5a. Judges

Three of the four are LaunchDarkly's stock judges: **AI Configs → Judges** and enable
**Accuracy**, **Relevance**, and **Toxicity**. Each arrives with a single `default`
variation on `Anthropic.claude-sonnet-4-5`, tags `ai` + `judge`, an evaluation metric key
of `$ld:ai:judge:<name>`, and a three-message prompt (`system` rubric, `assistant`
carrying `{{message_history}}`, `user` carrying `{{response_to_evaluate}}`). Toxicity is
**inverted** — lower is better — and comes that way out of the box. Leave all three at
their defaults; nothing in this project modifies them. Note that **Relevance is enabled
but not attached to anything**, so you can skip it if you only care about what runs.

The fourth is custom: **`score-read-judge`** ("score read judge"), same three-message
scaffold and the same Sonnet model, but with this system prompt:

> You're here to find out if the users like the score evaluation. Do the users often have
> a negative sentiment about the score being set?
>
> Do the users often have to correct the score?

Create it via **Judges → Create judge**, keep tags `ai` and `judge`, leave "lower is
better" off, and keep the `{{message_history}}` / `{{response_to_evaluate}}` variables in
the assistant and user messages — the judge gets no input without them.

### 5b. Completion configs

Two single-variation completion configs, both on `Anthropic.claude-haiku-4-5-20251001`,
both enabled with the `Default` variation as the default rule in **both** environments.
Each has one `system` message and no user message — the app supplies the photo or the
text at call time.

**`score-photo-scan`** — "Reads Crit/Kill/Tac off a photo of a Kill Team turn-tracker
card. Seeded from the defaults in scoreVision.ts."

> You are reading a Kill Team turn-tracker card from a photo. The card has five magnets
> sliding along labeled scales: KILL OP, CRIT OP, TAC OP, CP, and Turning Point. Read the
> magnet position on each scale and report CRIT OP, KILL OP, and TAC OP as integers 0-6.
> Respond with strict JSON only: {"crit": n, "kill": n, "tac": n}.

**`score-text-parse`** — "Parses Crit/Kill/Tac out of a natural-language score
description. Seeded from the defaults in scoreTextParse.ts."

> Parse a player's natural-language description of their Kill Team score into CRIT OP,
> KILL OP, and TAC OP as integers 0-6. Respond with strict JSON only: {"crit": n, "kill":
> n, "tac": n}.

Both prompts are duplicated as in-code fallbacks in
[`src/lib/server/ai/scoreVision.ts`](../src/lib/server/ai/scoreVision.ts) and
[`src/lib/server/ai/scoreTextParse.ts`](../src/lib/server/ai/scoreTextParse.ts), which is
what runs if LaunchDarkly is unreachable. If you change the prompt in one place, change
it in both or the fallback quietly diverges.

### 5c. `score-chat` (agent)

The centerpiece: an **agent**-mode AI Config with three published variations, read by
[`src/lib/server/ai/scoreChat.ts`](../src/lib/server/ai/scoreChat.ts). Agent mode means
each variation carries **instructions** rather than a message list.

| Variation key | Name | Model |
|---|---|---|
| `score-chatting-bot` | Score chatting bot | `Anthropic.claude-haiku-4-5-20251001` |
| `picture-first` | Picture first | `Anthropic.claude-opus-4-8` |
| `cheapest-api` | cheapest-api | `Anthropic.claude-sonnet-4-5` |

`score-chatting-bot` instructions:

> Collect the Crit Op, Tac Op, and Kill Op. Then ask the user the Primary op. Deliver this
> to the clientside for turning into a score. All scores are necessary and could be
> supplied with a screenshot or camera picture. Also ask for the opponents scores.
>
> Set known: true for a side as soon as you have its Crit, Kill and Tac values, even if
> you still need to ask which op is Primary.

`picture-first` and `cheapest-api` share a second, longer instruction set — they differ
only by model, which is the point of the comparison:

> Ask the user to take a picture of the final score dice or written down. Include the
> opponents score and ask which side the opponent is on in the picture(left or right). Be
> extra pushy about the picutre, offer to read a paper score as well as a dice board
> score. Remind the user they can take a pic with a cellphone.
>
> Then fallback to asking for the scores and passing the to the server. Collect the Crit
> Op, Tac Op, and Kill Op. Then ask the user the Primary op. Deliver this to the
> clientside for turning into a score. All scores are necessary and could be supplied with
> a screenshot or camera picture.Ask for opponents scores
>
> Set known: true for a side as soon as you have its Crit, Kill and Tac values, even if
> you still need to ask which op is Primary.

(Typos included — that's the live text.)

**Judges per variation.** On each variation, under **Judges / evaluations**, attach:

| Variation | Judges (sampling rate) |
|---|---|
| `score-chatting-bot` | `score-read-judge` **0.5**, `accuracy` 0.1, `toxicity` 0.1 |
| `picture-first` | `score-read-judge` 0.1, `accuracy` 0.1, `toxicity` 0.1 |
| `cheapest-api` | `score-read-judge` 0.1, `accuracy` 0.1, `toxicity` 0.1 |

The 0.5 on `score-chatting-bot` is deliberate: it's the fallthrough variation, so the
custom judge sees half of default traffic while the stock judges stay at 10%.

**Targeting — Production (enabled):**

1. **Individual target:** user key `demo-test1` → `Picture first`
2. **Rule:** context `kind` **is one of** `user` → **percentage rollout**: `disabled` 0%,
   `Score chatting bot` 50%, `Picture first` 25%, `cheapest-api` 25% (randomized by
   `user`)
3. **Default rule:** `Score chatting bot`
4. **Off variation:** `disabled`

**Targeting — Test (enabled):** default rule `disabled`, off variation `disabled`.

Every AI Config also gets a built-in `disabled` variation you don't create — it's what the
SDK serves when the config is off, and the app treats it as "no AI chat".

## Verifying it took

The MCP server can only write, so read state back with the REST API and a token in
`LAUNCHDARKLY_ACCESS_TOKEN`:

```bash
curl -s -H "Authorization: $LAUNCHDARKLY_ACCESS_TOKEN" "https://app.launchdarkly.com/api/v2/flags/challenger?summary=true"
```

AI Configs need the beta header:

```bash
curl -s -H "Authorization: $LAUNCHDARKLY_ACCESS_TOKEN" -H "LD-API-Version: beta" "https://app.launchdarkly.com/api/v2/projects/challenger/ai-configs?limit=50"
```
