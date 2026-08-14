# Recreating Challenger's LaunchDarkly configuration

This is a from-scratch recipe for a **new LaunchDarkly project** that Challenger
will run against unmodified. Every key below is hardcoded in application source,
so the names are not suggestions — a typo means the flag silently evaluates to
its in-code default and the feature looks "off" with nothing in the logs to say
why.

Each section gives the **UI steps** (what a person clicks) and the equivalent
**REST API** call, so you can do this by hand once or script it for a second
environment.

> **Provenance of this guide.** The inventory — keys, kinds, attributes,
> variation types, defaults, judge sampling rates — is read directly out of this
> repository and is authoritative. The REST request shapes have **not** been
> executed against the live API from this session: `launchdarkly.com` is blocked
> by this environment's network egress policy, so neither the API nor the API
> docs were reachable. Treat the `curl` bodies as a starting point and confirm
> field names against <https://launchdarkly.com/docs/api> before running them
> unattended. The [Step 0 export](#step-0-export-what-you-already-have) is the
> fastest way to check them against reality.

---

## Prerequisites

| Thing | Where it comes from |
| --- | --- |
| An API access token | Account settings → **Authorization** → **Create token**. Needs a writer role, or a custom role covering flags, segments, AI Configs, metrics and experiments. |
| Project key | Yours to choose. Challenger's is `challenger`. Used below as `$PROJ`. |
| Environment key | `production` in the examples. Repeat per environment. |

```sh
export LD_TOKEN='api-xxxxxxxx'          # never commit this
export PROJ='challenger'
export ENV='production'
export LD_API='https://app.launchdarkly.com/api/v2'
```

Two header notes that trip people up:

- The token goes in a bare `Authorization` header — **no `Bearer` prefix**.
- Pin the API version with `LD-API-Version`. Endpoints still in beta (AI Configs
  among them) want `LD-API-Version: beta` instead of a date.

```sh
# reusable header set
auth=(-H "Authorization: $LD_TOKEN" -H 'Content-Type: application/json')
ga=(-H 'LD-API-Version: 20240415')
beta=(-H 'LD-API-Version: beta')
```

---

## Step 0: Export what you already have

Before recreating anything, dump the current state. This doubles as a check on
every request shape in this guide, and gives you a diff target at the end.

```sh
mkdir -p ld-export

curl -sS "${auth[@]}" "${ga[@]}" \
  "$LD_API/flags/$PROJ?env=$ENV&summary=false" > ld-export/flags.json

curl -sS "${auth[@]}" "${ga[@]}" \
  "$LD_API/segments/$PROJ/$ENV" > ld-export/segments.json

curl -sS "${auth[@]}" "${beta[@]}" \
  "$LD_API/projects/$PROJ/ai-configs" > ld-export/ai-configs.json

curl -sS "${auth[@]}" "${ga[@]}" \
  "$LD_API/metrics/$PROJ" > ld-export/metrics.json

curl -sS "${auth[@]}" "${ga[@]}" \
  "$LD_API/projects/$PROJ/environments/$ENV/experiments" > ld-export/experiments.json

curl -sS "${auth[@]}" "${ga[@]}" \
  "$LD_API/projects/$PROJ/context-kinds" > ld-export/context-kinds.json
```

`flags.json` is the one worth reading closely: with `summary=false` each flag
carries its full per-environment `environments.<env>` block — `on`, `rules`,
`targets`, `fallthrough`, `offVariation` — which is the part the UI makes
tedious to transcribe by hand.

There is no bulk "import this JSON" endpoint. Recreation is per-resource, which
is what the rest of this guide walks through.

---

## Step 1: Project and environments

**UI:** Create a project. Give it the key you exported as `$PROJ`. LaunchDarkly
seeds it with `production` and `test` environments.

**API:**

```sh
curl -sS -X POST "${auth[@]}" "${ga[@]}" "$LD_API/projects" -d '{
  "key": "challenger",
  "name": "Challenger",
  "environments": [
    { "key": "production", "name": "Production", "color": "417505" },
    { "key": "test",       "name": "Test",       "color": "F5A623" }
  ]
}'
```

Then collect the two credentials the app needs. **UI:** Project settings →
**Environments** → the environment's ⋯ menu.

| Credential | Env var | Notes |
| --- | --- | --- |
| Client-side ID | `PUBLIC_LD_CLIENT_ID` | Not secret — ships to every browser. `src/lib/stores/launchdarkly.ts` falls back to a committed default when unset. |
| SDK key | `LAUNCHDARKLY_SDK_KEY` | **Secret.** Without it the server SDK never initializes, every AI Config falls back to its in-code default, and the Monitoring tab stays empty. |

An `LD_ACCESS_TOKEN` is also needed at deploy time for sourcemap upload — that's
the API token from the prerequisites, not an SDK credential.

---

## Step 2: Context kinds

Challenger evaluates against a **multi-context** of two kinds. Both are built in
[`src/lib/launchdarkly/context.ts`](../src/lib/launchdarkly/context.ts)
(browser) and [`src/lib/server/ai/context.ts`](../src/lib/server/ai/context.ts)
(server, `user` only).

### `user`

| Attribute | Type | Set from |
| --- | --- | --- |
| `key` | string | The account id, or the literal `anonymous` before login |
| `name` | string | Display name |
| `email` | string | **Marked private** via `_meta.privateAttributes` — it is never sent to LD |
| `anonymous` | boolean | `true` pre-login |
| `hasPlayedTournament` | boolean | Precomputed in Postgres. **This is the attribute the segment in Step 3 keys on.** |
| `totalMatches` | number | Precomputed in Postgres |

### `device`

| Attribute | Type | Set from |
| --- | --- | --- |
| `key` | string | `"{os}-{browser}"`, e.g. `other-chrome` |
| `type` | string | `mobile` \| `tablet` \| `desktop` |
| `os` | string | `ios` \| `android` \| `other` |
| `browser` | string | `chrome` \| `firefox` \| `safari` \| `other` |

**UI:** Nothing to do up front — LaunchDarkly registers a context kind the first
time it sees one evaluated, and the attributes appear on the **Contexts** page
after real traffic. If you want them selectable in the targeting UI *before* any
traffic arrives, create them explicitly under project settings → **Context
kinds**.

**API:**

```sh
curl -sS -X PUT "${auth[@]}" "${ga[@]}" \
  "$LD_API/projects/$PROJ/context-kinds/device" -d '{
  "name": "device",
  "description": "Browser/OS the session is running in",
  "hideInTargeting": false
}'
```

`user` exists by default and needs no call.

> Because `email` is a private attribute, it will never show up in the Contexts
> explorer. That is intentional, not a broken context — don't try to target on
> it.

---

## Step 3: Segment — `non-tournament-players`

One segment, and it is load-bearing: it is the audience for the
`social-matchmake-cta` experiment. Players who have never entered a tournament
are the cohort the "Matchmake Now!" call-to-action is aimed at.

| Field | Value |
| --- | --- |
| Key | `non-tournament-players` |
| Name | Non-tournament players |
| Type | Rule-based (not a synced/big segment) |
| Rule | Context kind `user`, attribute `hasPlayedTournament`, operator **is false** |

**UI:** **Segments** → **Create segment** → *Rule-based*. Key
`non-tournament-players`. Add a rule: context kind `user` → attribute
`hasPlayedTournament` → operator `is one of` → value `false`. Save.

**API** — note segments are **per-environment**; creating one in `production`
does not create it in `test`. Loop over your environments:

```sh
curl -sS -X POST "${auth[@]}" "${ga[@]}" "$LD_API/segments/$PROJ/$ENV" -d '{
  "key": "non-tournament-players",
  "name": "Non-tournament players",
  "description": "Users whose hasPlayedTournament attribute is false. Audience for the social-matchmake-cta experiment.",
  "tags": ["experiment-audience"]
}'
```

Then attach the rule with a **semantic patch** (note the custom `Content-Type`):

```sh
curl -sS -X PATCH \
  -H "Authorization: $LD_TOKEN" \
  -H 'Content-Type: application/json; domain-model=launchdarkly.semanticpatch' \
  "${ga[@]}" \
  "$LD_API/segments/$PROJ/$ENV/non-tournament-players" -d '{
  "comment": "Target users who have never played a tournament",
  "instructions": [{
    "kind": "addRule",
    "clauses": [{
      "contextKind": "user",
      "attribute": "hasPlayedTournament",
      "op": "in",
      "values": [false],
      "negate": false
    }]
  }]
}'
```

### Give the segment a real population

A segment with two people in it will never accumulate enough experiment
subjects to reach significance. The seed data exists specifically to widen it:
[`demo-fixtures.ts`](../src/lib/server/db/demo-fixtures.ts) defines 20
`CASUAL_PLAYERS` who never attend a tournament, so their
`hasPlayedTournament` stays `false` in both real-auth and demo mode. Run
`npm run db:seed`, and drive traffic with `npm run test:e2e:traffic`.

> ⚠️ `npm run test:e2e:traffic` fires real evaluations and exposures at the
> **production** LD environment. That analytics data cannot be taken back out.
> See [CLAUDE.md](../CLAUDE.md).

---

## Step 4: Feature flags

Three flags. All three are **boolean**, and all three are read in the browser —
so **client-side availability must be enabled** on every one of them. This is
the single most common reason a correctly-named flag appears dead: the JS SDK
simply never receives a flag that isn't marked available to client-side IDs.

| Key | Type | Gates | Read via |
| --- | --- | --- | --- |
| `social-matchmake` | boolean | The "Matchmake Now!" CTA on `/leaderboard` and `/stats` | `flagVariation()` → `client.variation()` |
| `debug-mode` | boolean | The floating Dev Control Panel | `flagVariation()` → `client.variation()` |
| `tourneys-in-area` | boolean | The promo banner in the masthead | `$flags[...]` → `client.allFlags()` |

### That `variation()` vs `allFlags()` split is deliberate

It is not stylistic, and it decides whether Experimentation works:

- `allFlags()` (which fills the `flags` store, used by `tourneys-in-area`) is a
  **bulk local read that sends no event to LaunchDarkly**.
- `variation()` (used by `flagVariation`, and therefore by `social-matchmake`)
  **emits an evaluation event — and that event _is_ the experiment exposure.**

A flag under an experiment enrols a context only once it has been evaluated
through `variation()`. If `social-matchmake` were ever switched to the
`$flags[...]` style, the experiment would keep running and never record a single
subject. See the comments in
[`src/lib/stores/launchdarkly.ts`](../src/lib/stores/launchdarkly.ts).

### UI steps (repeat per flag)

1. **Flags** → **Create flag**.
2. Name and key from the table. **The key must match exactly** — it is a string
   literal in the Svelte source.
3. Configuration: **Custom** → **Boolean**, variations `true` / `false`.
4. **Check "SDKs using Client-side ID."** Under *Client-side SDK availability*.
5. Serve `false` when the flag is off. Leave targeting off for now.

### API

```sh
for flag in \
  'social-matchmake|Social matchmake|Shows the "Matchmake Now!" CTA on the leaderboard and stats pages. Under the social-matchmake-cta experiment — must be read through variation().' \
  'debug-mode|Debug mode|Shows the floating Dev Control Panel.' \
  'tourneys-in-area|Tournaments in area|Shows the "tournaments near you" promo banner in the masthead.'
do
  IFS='|' read -r key name desc <<< "$flag"
  curl -sS -X POST "${auth[@]}" "${ga[@]}" "$LD_API/flags/$PROJ" -d "{
    \"key\": \"$key\",
    \"name\": \"$name\",
    \"description\": \"$desc\",
    \"variations\": [ { \"value\": true }, { \"value\": false } ],
    \"defaults\": { \"onVariation\": 0, \"offVariation\": 1 },
    \"clientSideAvailability\": { \"usingEnvironmentId\": true, \"usingMobileKey\": false },
    \"temporary\": false,
    \"tags\": [\"challenger\"]
  }"
done
```

`variations[0]` is `true` and `variations[1]` is `false`, so `onVariation: 0` /
`offVariation: 1` means "on serves true, off serves false" — the ordering every
targeting instruction below assumes.

### Targeting

Flag targeting is per-environment and applied with a semantic patch. The body
carries an `environmentKey` alongside the instructions.

**`debug-mode` — individual targeting.** This is the "flag by hardcoded user
context" pattern: rather than a rule, name the specific user keys that get the
dev panel. The key is the account id, so grab it from your seeded database (or
the Contexts page) rather than guessing.

```sh
curl -sS -X PATCH \
  -H "Authorization: $LD_TOKEN" \
  -H 'Content-Type: application/json; domain-model=launchdarkly.semanticpatch' \
  "${ga[@]}" \
  "$LD_API/flags/$PROJ/debug-mode" -d '{
  "comment": "Dev panel for named accounts only",
  "environmentKey": "production",
  "instructions": [
    { "kind": "turnFlagOn" },
    { "kind": "addTargets", "contextKind": "user", "variationId": "<variation-id-for-true>", "values": ["<max-account-id>"] }
  ]
}'
```

**`social-matchmake` — segment targeting**, if you want the CTA visible to the
cohort *without* running an experiment. (If you are running the experiment in
Step 6, configure it there instead — the experiment owns this rule.)

```sh
curl -sS -X PATCH \
  -H "Authorization: $LD_TOKEN" \
  -H 'Content-Type: application/json; domain-model=launchdarkly.semanticpatch' \
  "${ga[@]}" \
  "$LD_API/flags/$PROJ/social-matchmake" -d '{
  "comment": "Serve the CTA to non-tournament players",
  "environmentKey": "production",
  "instructions": [
    { "kind": "turnFlagOn" },
    { "kind": "addRule",
      "clauses": [{ "contextKind": "user", "attribute": "segmentMatch", "op": "segmentMatch", "values": ["non-tournament-players"] }],
      "variationId": "<variation-id-for-true>" }
  ]
}'
```

`<variation-id-for-true>` is the `_id` LaunchDarkly assigned when the flag was
created — it is a UUID, not the index. Read it back:

```sh
curl -sS "${auth[@]}" "${ga[@]}" "$LD_API/flags/$PROJ/social-matchmake" \
  | jq '.variations[] | {_id, value}'
```

**`tourneys-in-area`** needs no targeting — flip it on or off for everyone.

---

## Step 5: AI Configs

Five AI Configs: three **completion** configs the app resolves by key, and two
**judge** configs attached to one of them.

| Key | Mode | Used by | Default model | Referenced at |
| --- | --- | --- | --- | --- |
| `score-photo-scan` | completion | Read crit/kill/tac off a tracker photo | `claude-haiku-4-5` | [`scoreVision.ts`](../src/lib/server/ai/scoreVision.ts) |
| `score-text-parse` | completion | Parse a typed score description | `claude-haiku-4-5` | [`scoreTextParse.ts`](../src/lib/server/ai/scoreTextParse.ts) |
| `score-chat` | completion | Multi-turn chat that fills the match form | `claude-haiku-4-5` | [`scoreChat.ts`](../src/lib/server/ai/scoreChat.ts) |
| `toxicity` | judge | Attached to `score-chat`, sampled at **0.1** | your choice | discovered at runtime |
| `score-read-judge` | judge | Attached to `score-chat`, sampled at **0.5** | your choice | discovered at runtime |

### How the app resolves them

Each completion config is resolved per request with an **in-code fallback**:

```ts
aiClient.completionConfig(aiConfigKey, context, {
  model: { name: defaultModel },
  messages: [{ role: 'system', content: defaultPrompt }]
}, undefined, 'vercel')
```

Two consequences worth internalising before you debug anything:

1. **A missing or misspelled AI Config is invisible.** The app falls back to the
   in-code model and prompt and answers correctly. The only symptom is an empty
   Monitoring tab. If you want LD to actually be in control, verify the key by
   watching evaluations arrive, not by watching the feature work.
2. The default prompts in source are the **fallback**, not the config. Copy them
   into the LD variation verbatim on first setup so behaviour doesn't shift the
   moment LD starts answering; edit from there.

The judges are *not* named in application code — `scoreChat.ts` reads
`aiConfig.judgeConfiguration.judges` off the resolved config at runtime. Adding,
removing or re-tuning a judge is a LaunchDarkly-side edit with **no code
change**. That's also why a day's token usage can show a model the app never
asks for: each judge is a separate AI Config with its own model.

### UI steps

1. **AI Configs** → **Create AI Config**. Key `score-photo-scan`, mode
   **Completion**.
2. Add a variation. Pick the model (`claude-haiku-4-5` to match the in-code
   default) and paste the system prompt from `scoreVision.ts`'s
   `DEFAULT_PROMPT`.
3. On the **Targeting** tab, turn it on and set the default variation to the one
   you just made.
4. Repeat for `score-text-parse` and `score-chat` with their own prompts.
5. Create `toxicity` and `score-read-judge` with mode **Judge**, each with its
   own prompt and model.
6. Reopen `score-chat` → its variation → **Judges** → add `toxicity` at sampling
   rate `0.1` and `score-read-judge` at `0.5`.

### API

AI Config endpoints are beta — use the `beta` header set. This is also the one
area where the [LaunchDarkly MCP server](../.mcp.json) is a genuinely easier
path than curl (see the [note below](#what-the-mcp-server-can-and-cant-do)).

```sh
curl -sS -X POST "${auth[@]}" "${beta[@]}" \
  "$LD_API/projects/$PROJ/ai-configs" -d '{
  "key": "score-photo-scan",
  "name": "Score photo scan",
  "description": "Reads CRIT/KILL/TAC off a photo of a Kill Team turning-point tracker.",
  "mode": "completion",
  "tags": ["challenger", "score-scan"],
  "defaultVariation": {
    "key": "haiku-baseline",
    "name": "Haiku baseline",
    "model": { "name": "claude-haiku-4-5" },
    "messages": [{
      "role": "system",
      "content": "You are reading a Kill Team turn-tracker card from a photo. The card has five magnets sliding along labeled scales: KILL OP, CRIT OP, TAC OP, CP, and Turning Point. Read the magnet position on each scale and report CRIT OP, KILL OP, and TAC OP as integers 0-6. Respond with strict JSON only: {\"crit\": n, \"kill\": n, \"tac\": n}."
    }]
  }
}'
```

Additional variations (for an AI Config experiment, or a model A/B):

```sh
curl -sS -X POST "${auth[@]}" "${beta[@]}" \
  "$LD_API/projects/$PROJ/ai-configs/score-photo-scan/variations" -d '{
  "key": "sonnet-challenger",
  "name": "Sonnet challenger",
  "model": { "name": "claude-sonnet-5" },
  "messages": [{ "role": "system", "content": "..." }]
}'
```

A judge config is the same call with `"mode": "judge"`. Attach judges by
patching the `score-chat` variation:

```sh
curl -sS -X PATCH "${auth[@]}" "${beta[@]}" \
  "$LD_API/projects/$PROJ/ai-configs/score-chat/variations/haiku-baseline" -d '{
  "comment": "Attach judges",
  "judgeConfiguration": {
    "judges": [
      { "judgeConfigKey": "toxicity",         "samplingRate": 0.1 },
      { "judgeConfigKey": "score-read-judge", "samplingRate": 0.5 }
    ]
  }
}'
```

Finally, turn targeting on so the config serves something:

```sh
curl -sS -X PATCH "${auth[@]}" "${beta[@]}" \
  "$LD_API/projects/$PROJ/ai-configs/score-photo-scan/targeting" -d '{
  "environmentKey": "production",
  "comment": "Serve the baseline variation to everyone",
  "instructions": [{ "kind": "turnFlagOn" }]
}'
```

> The SDK field for a judge key is `key`; the REST API calls the same thing
> `judgeConfigKey`. `scoreChat.ts` notes this discrepancy inline — it is not a
> bug in either.

### Why the Monitoring tab can stay empty on a healthy app

Worth writing down, because it looks like a broken config and isn't. Two
independent pipelines both batch, and neither survives a frozen serverless
invocation:

- Analytics events (every `track*` call) flush on a 5s timer.
- OpenTelemetry spans batch in the observability plugin's exporter.

Vercel can freeze the function the moment the response is written, so a fast
turn loses both. `flushLdTelemetry()` in
[`ldClient.ts`](../src/lib/server/ai/ldClient.ts) exists solely to await both
before returning.

Separately: **metrics alone carry no trace association.** LaunchDarkly links a
trace to an AI Config only when the model request runs inside a span carrying
`launchdarkly.ai.config.key` plus the `gen_ai.*` attributes — which is what
`withLlmSpan()` wraps every call in.

---

## Step 6: The `social-matchmake-cta` experiment

| Field | Value |
| --- | --- |
| Key | `social-matchmake-cta` |
| Flag | `social-matchmake` |
| Audience | The `non-tournament-players` segment |
| Split | 50/50 across `true` / `false` |
| Randomization unit | `user` context kind |

**UI:** **Experiments** → **Create experiment** → *Feature change*. Pick the
`social-matchmake` flag. Set the audience to the `non-tournament-players`
segment, randomize by `user`, split 50/50. Attach the metric from Step 7. Start
the iteration.

**API:**

```sh
curl -sS -X POST "${auth[@]}" "${ga[@]}" \
  "$LD_API/projects/$PROJ/environments/$ENV/experiments" -d '{
  "key": "social-matchmake-cta",
  "name": "Social matchmake CTA",
  "description": "Does the Matchmake Now! CTA get clicked by players who have never entered a tournament?",
  "maintainerId": "<your-member-id>",
  "iteration": {
    "hypothesis": "Showing a matchmaking CTA to non-tournament players drives engagement.",
    "canReshuffleTraffic": false,
    "metrics": [{ "key": "matchmake-click-rate", "isGroup": false, "primary": true }],
    "treatments": [
      { "name": "Control",   "baseline": true,  "allocationPercent": "50", "parameters": [{ "flagKey": "social-matchmake", "variationId": "<variation-id-for-false>" }] },
      { "name": "Treatment", "baseline": false, "allocationPercent": "50", "parameters": [{ "flagKey": "social-matchmake", "variationId": "<variation-id-for-true>" }] }
    ],
    "flags": {
      "social-matchmake": {
        "ruleId": "fallthrough",
        "flagConfigVersion": 1
      }
    },
    "randomizationUnit": "user"
  }
}'
```

Then start it:

```sh
curl -sS -X PATCH "${auth[@]}" "${ga[@]}" \
  "$LD_API/projects/$PROJ/environments/$ENV/experiments/social-matchmake-cta" -d '{
  "instructions": [{ "kind": "startIteration", "changeJustification": "Initial run" }]
}'
```

The experiment body is the fiddliest object in the API — building the first
iteration in the UI and reading it back with `GET` is genuinely faster than
getting this right blind.

### Sizing expectations

Of ~71 login-capable seeded accounts, only the 22 casual accounts (plus Max and
test1) are in the segment at all; roughly half of those land in the treatment.
A 25-account traffic draw therefore yields **~8 enrolled subjects and ~4 clicks**
— see the sizing comment in
[`matchmake-random-users.e2e.ts`](../e2e/traffic/matchmake-random-users.e2e.ts).
Budget several runs before the results panel says anything.

---

## Step 7: Metrics and Observability

There are **no custom `client.track()` calls anywhere in the app.** Every metric
is defined LaunchDarkly-side against auto-captured Observability data, which
means these are UI-first and the app needs no change to support them.

### The experiment metric

**UI:** **Metrics** → **Create metric** → *Click* conversion. Key
`matchmake-click-rate`. Selector `#matchmake-now`, on `/leaderboard` and
`/stats`. Success criterion: higher is better.

```sh
curl -sS -X POST "${auth[@]}" "${ga[@]}" "$LD_API/metrics/$PROJ" -d '{
  "key": "matchmake-click-rate",
  "name": "Matchmake click rate",
  "kind": "click",
  "selector": "#matchmake-now",
  "urls": [
    { "kind": "substring", "substring": "/leaderboard" },
    { "kind": "substring", "substring": "/stats" }
  ],
  "isNumeric": false,
  "successCriteria": "HigherThanBaseline"
}'
```

⚠️ **The selector is load-bearing in both directions.** The button is rendered
as `<button id="matchmake-now">` on both
[`leaderboard/+page.svelte`](../src/routes/leaderboard/+page.svelte) and
[`stats/+page.svelte`](../src/routes/stats/+page.svelte), and the source carries
an inline comment saying so. Renaming the id, or pointing the metric at a
selector that matches nothing, silently zeroes out the experiment's conversions
— which looks exactly like a CTA nobody wanted to click.

### Error metric (optional, and a bit cheeky)

The "Matchmake Now!" button is deliberately unimplemented: both pages call
`LDObserve.recordError()` with the message *"Matchmake Now is not implemented
yet"* and a `component` attribute. That gives you a genuine, reliably-fired
error stream to build an error metric on — or just to watch in Observability.

### Frustration signals

Rage clicks / frustration clicks come from the Observability plugin's
auto-capture. Nothing to configure beyond having the plugin installed, which
`src/lib/stores/launchdarkly.ts` already does.

### Session Replay

Enabled in the same plugin block with `privacySetting: 'default'`, which masks
inputs while keeping replays useful. It's on as soon as the client-side ID is
valid — no LD-side setup.

### Sourcemaps

`LD_ACCESS_TOKEN` at deploy time uploads sourcemaps so production stack traces
de-minify. The `version` passed to the Observability plugin is the deploy's git
SHA and **must match** the sourcemaps uploaded for that deploy, or traces stay
minified.

One detail worth copying: the plugin's `environment` is set explicitly to a
build-time constant rather than left to default. Left alone it defaults to
`production`, which files every Playwright run's errors alongside real user
traffic with no way to tell them apart — and those runs never upload sourcemaps,
so their traces can never unroll. Labelling them `ci` keeps them one filter
away.

---

## Verification checklist

Work down this list — it is ordered so each step's failure explains the next.

1. **Client-side flags arrive.** Load the app, open the console. You should see
   `LaunchDarkly client started!!!`. Turn on `debug-mode` for yourself and open
   the Dev Control Panel: it lists every flag the browser received. All three
   flag keys should be present. A missing key means either the key is
   misspelled or client-side availability is off.
2. **Contexts land correctly.** The `<header>` carries a `data-ld-context`
   attribute — `anonymous` before login, the account id after. If it stays
   `anonymous` post-login, `identifyUser` isn't completing.
3. **The segment has members.** Segments → `non-tournament-players` → Contexts.
   If it's near-empty, seed and generate traffic (Step 3).
4. **Exposures are recording.** After a logged-in visit to `/leaderboard`,
   `social-matchmake` should show recent evaluations. Zero evaluations with a
   working UI means it's being read through `allFlags()` instead of
   `variation()` — see [Step 4](#that-variation-vs-allflags-split-is-deliberate).
5. **AI Configs are being resolved.** Run a score scan with
   `LAUNCHDARKLY_SDK_KEY` and `ANTHROPIC_API_KEY` both set, then check the AI
   Config's Monitoring tab. Empty means the key is wrong (silent fallback), the
   SDK key is missing, or telemetry was lost to a frozen invocation.
6. **Judges are firing.** With sampling at 0.1 and 0.5, run the score chat
   several turns before concluding anything. Judge results appear alongside
   generations in Monitoring.

---

## What the MCP server can and can't do

[`.mcp.json`](../.mcp.json) wires up `@launchdarkly/mcp-server` with
`--scope write`, driven by a `LAUNCHDARKLY_ACCESS_TOKEN` env var. It is the
quickest path for **flags and AI Configs**, and useless for everything else:

| Resource | MCP tools |
| --- | --- |
| Feature flags | `create-feature-flag`, `update-feature-flag`, `delete-feature-flag` |
| AI Configs | `create-ai-config`, `update-ai-config`, `delete-ai-config` |
| AI Config variations | `create-ai-config-variation`, `update-ai-config-variation`, `delete-ai-config-variation` |
| AI Config targeting | `update-ai-config-targeting` |
| **Segments** | ❌ none |
| **Metrics** | ❌ none |
| **Experiments** | ❌ none |
| **Reading anything** | ❌ none — every tool is a write |

So a realistic split: MCP for Steps 4 and 5, REST or the UI for Steps 3, 6 and
7, and REST for the Step 0 export (MCP cannot read).

`update-feature-flag` takes a plain **JSON Patch** (`{op, path, value}`), not
the semantic-patch instructions used in the curl examples above. It also
supports `dryRun`, which is worth using the first time you touch a production
flag.

---

## Quick reference

```
Project        challenger
Environments   production, test

Context kinds  user   (key, name, email[private], anonymous,
                       hasPlayedTournament, totalMatches)
               device (key = "{os}-{browser}", type, os, browser)

Segment        non-tournament-players   user.hasPlayedTournament is false

Flags          social-matchmake     boolean, client-side, read via variation()
               debug-mode           boolean, client-side, individual targeting
               tourneys-in-area     boolean, client-side, read via allFlags()

AI Configs     score-photo-scan     completion   claude-haiku-4-5
               score-text-parse     completion   claude-haiku-4-5
               score-chat           completion   claude-haiku-4-5
               toxicity             judge        sampled 0.1 on score-chat
               score-read-judge     judge        sampled 0.5 on score-chat

Experiment     social-matchmake-cta  flag social-matchmake,
                                     audience non-tournament-players, 50/50

Metric         matchmake-click-rate  click on #matchmake-now (/leaderboard, /stats)
```
