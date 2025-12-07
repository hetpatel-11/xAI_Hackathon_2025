# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

GrokGuard is an agentic safety platform prototype for X.com built for the xAI Hackathon 2025. It implements a production-style, multi-agent moderation pipeline using Grok models to detect scams, impersonators, bait posts, and DM scams while explicitly modeling free-speech protection through adversarial debate.

The repo today is a TypeScript/Node codebase focused on:
- A 5-agent debate system (Detector → Evidence → Prosecutor → Defender → Arbiter)
- An optional autonomous investigator + multi-turn debate layer
- Direct integrations with the xAI Grok APIs and X API via `@xdevplatform/xdk`

A future Next.js dashboard is planned (`app/`), but no UI code is present yet.

## Environment & prerequisites

Core runtime:
- Node.js (TypeScript executed via `tsx`, no separate build step)
- Real access to:
  - xAI Grok API (for reasoning + vision)
  - X API via bearer token (for real user/profile/post data)

Environment variables (loaded from `.env.local`):
- `XAI_API_KEY` – required by `lib/grok/client.ts` for all Grok calls
- `X_API_BEARER_TOKEN` – required by `lib/x-api/client.ts`, `lib/x-api/enhanced-client.ts`, and the `@xdevplatform/xdk` clients used in the `test-*.ts` scripts

Most test scripts will fail fast if `.env.local` is missing or these variables are unset.

## Common commands

All commands are run from the repo root (`/Users/hetpatel/Desktop/XAI_Hackathon`). There are no meaningful `npm test`/build/lint scripts defined in `package.json`; development is done by executing `.ts` scripts via `tsx`.

Install dependencies:

```bash path=null start=null
npm install
```

Main 5-agent system test (simulated scenarios only):

```bash path=null start=null
npx tsx test-agent-system.ts
```

This exercises the full 5-agent pipeline using synthetic `XContent` scenarios (crypto scam, impersonator, legitimate dev, crypto discussion edge case, and DM scam) and prints a tabular summary plus per-test debate details.

API connectivity + basic Grok/Grok Vision smoke test:

```bash path=null start=null
npx tsx test-apis.ts
```

This verifies:
- X API bearer-token access and recent search
- Grok reasoning (`grok-4-1-fast-reasoning`)
- Grok vision (`grok-2-vision-1212`)

Enhanced legitimacy analysis for real X accounts (multi-factor scoring only):

```bash path=null start=null
npx tsx test-enhanced.ts
```

This uses `lib/x-api/enhanced-client.ts` to compute a detailed `legitimacyScore`, risk level, and factor breakdown for predefined usernames (e.g., `XDevelopers`, `elonmusk`, `OpenAI`) without running the full agent debate.

Real X.com profile analysis – simple pipeline:

```bash path=null start=null
npx tsx test-real-x-simple.ts
```

For a small set of known accounts, this fetches profiles via X API, converts them to `XContent`, and runs the 5-agent debate (`runAgentDebate`) end-to-end, printing the arbiter’s explanation with basic word-wrapped formatting.

Real X.com data – posts + profiles + trending content:

```bash path=null start=null
npx tsx test-real-x-data.ts
```

This script:
- Searches for likely scam posts and runs the agent pipeline on one real scam-like tweet
- Runs the agent pipeline on the `XDevelopers` profile
- Samples a few trending posts and runs `runAgentDebate` with `skipLowConfidence: true` (fast path for low-suspicion content)

Real X.com profiles with enriched legitimacy pre-check:

```bash path=null start=null
npx tsx test-real-fixed.ts
```

This demonstrates the “fixed” real-user flow described in the analysis docs:
- Uses `XAPIClient.getEnrichedUser` to compute a pre-debate legitimacy score and signals
- Optionally skips the full GrokGuard debate for clearly legitimate accounts
- Otherwise runs `runAgentDebate` and logs pre-score vs agent decision side-by-side

Notes on “running a single test”:
- There is no Jest/Vitest-style test runner; each `test-*.ts` file is its own executable scenario suite.
- To add or isolate a scenario, edit the relevant script (e.g., `testScenarios` in `test-agent-system.ts`), or create a new `test-*.ts` file and run it with `npx tsx <file>.ts`.

## Architecture & code structure

### Types and core domain model (`lib/types`)

`lib/types/index.ts` defines the central domain types used across the system:
- `XContent` – normalized representation of any X.com artifact under review (post, profile, or DM), including author metadata and arbitrary `metadata` from X API.
- `DetectionResult` – final outcome of the 5-agent debate, with `confidenceScore`, `classification` (`'scam' | 'impersonator' | 'bait' | 'legitimate' | 'uncertain'`), and an embedded `AgentDebate` log.
- `AgentDebate` – structured record of all agent outputs (detector/evidence/prosecutor/defender/arbiter) plus `totalTokens` and `durationMs`.
- `DetectorOutput`, `EvidenceOutput`, and `ArbiterDecision` – individual agent outputs with the minimum structure the orchestrators assume.
- Additional types like `InvestigationPlan`/`InvestigationResult` and `LearningFeedback` model a future feedback loop and the autonomous investigator API.

Treat these types as the canonical contract between any future UI, API layer, or storage system and the GrokGuard engine.

### Grok client & prompts (`lib/grok`)

`lib/grok/client.ts` encapsulates access to xAI’s Grok models via `fetch`:
- Lazily constructs a singleton `GrokClient` using `XAI_API_KEY`.
- Exposes high-level methods:
  - `reason(prompt, systemPrompt?)` – single-call reasoning on `grok-4-1-fast-reasoning`.
  - `analyzeImage(imageUrl, question)` – vision reasoning on `grok-2-vision-1212`.
  - `quickClassify(prompt)` – cheap classification on `grok-3-mini`.
  - `conversation(messages, model?)` – lower-level multi-turn chat with token usage surfaced.

`lib/grok/prompts.ts` centralizes the system prompts for each agent:
- `DETECTOR_SYSTEM_PROMPT` – outputs JSON with `suspicionScore`, `signals`, `shouldEscalate`, `reasoning`.
- `EVIDENCE_SYSTEM_PROMPT` – guides synthesis of profile/content/network evidence.
- `PROSECUTOR_SYSTEM_PROMPT` – defines the “SCAM PROBABILITY” case format.
- `DEFENDER_SYSTEM_PROMPT` – defines the “LEGITIMACY PROBABILITY” defense format, emphasizing free-speech protection.
- `ARBITER_SYSTEM_PROMPT` – instructs the arbiter to output a fully structured JSON decision (final score, classification, recommended action, evidence/counter-evidence) with an explicit free-speech vs safety tradeoff.
- `IMAGE_ANALYSIS_PROMPT` – JSON-structured prompt for detecting stock/AI-generated profile images.

If you need to change behaviors across the entire system (e.g., adjust thresholds, wording, or output schema), start here rather than editing individual agents.

### 5-agent debate pipeline (`lib/agents`)

The core pipeline is implemented in `lib/agents` and is orchestrated by `runAgentDebate` in `lib/agents/orchestrator.ts`:

1. **Detector (`detector.ts`)**
   - Formats `XContent` into a plain-text description and calls `grok.reason` with `DETECTOR_SYSTEM_PROMPT`.
   - Parses the returned JSON (using a loose `{...}` match) into `DetectorOutput` and applies a safety fallback if parsing fails (escalate with medium suspicion).

2. **Evidence (`evidence.ts`)**
   - Optionally calls `grok.analyzeImage` with `IMAGE_ANALYSIS_PROMPT` for `authorProfileImage`, parses structured JSON into a `profileAnalysis` object.
   - Performs lightweight regex-based `contentAnalysis` for wallets, suspicious links, urgency, and impersonation signals.
   - Calls `grok.reason` with `EVIDENCE_SYSTEM_PROMPT` to synthesize post history/network context into a simplified structure (`postHistory`, `networkMetrics`).

3. **Prosecutor (`prosecutor.ts`)**
   - Builds a prosecution prompt with the original content and formatted evidence.
   - Calls `grok.reason` under `PROSECUTOR_SYSTEM_PROMPT` and extracts `SCAM PROBABILITY` from the response.

4. **Defender (`defender.ts`)**
   - Takes the prosecutor’s free-form case plus evidence, reframes evidence to highlight legitimacy signals, and calls `grok.reason` under `DEFENDER_SYSTEM_PROMPT`.
   - Extracts `LEGITIMACY PROBABILITY` from the response.

5. **Arbiter (`arbiter.ts`)**
   - Constructs a combined prompt with both arguments and scores, then calls `grok.reason` under `ARBITER_SYSTEM_PROMPT`.
   - Attempts to parse JSON; on failure, falls back to an averaged score between prosecutor and inverse defender probabilities.

`runAgentDebate` threads these together, handles optional fast-path behavior, and returns a `DetectionResult`:
- Supports `skipLowConfidence` (no full debate if detector does not escalate).
- Stubs out token counting for now (`totalTokens` always `0`), but standardizes logging, timing, and result shape.

When integrating GrokGuard into another surface (e.g., an API route or Next.js UI), the intended entrypoint is `runAgentDebate(XContent, options)`.

### Autonomous investigation & multi-turn debate (`lib/agents/debate-orchestrator.ts`, `lib/agents/investigator.ts`)

The “advanced” mode adds an autonomous tool-using investigator in front of a multi-round prosecutor/defender debate:

- `lib/agents/investigator.ts` implements `InvestigatorAgent`:
  - Uses `grok.reason` with `INVESTIGATOR_SYSTEM_PROMPT` to plan which tools to use (`fetch_user_profile`, `fetch_user_posts`, `search_similar_bios`, `check_follower_network`).
  - Executes those tools via `enhancedXApiClient` from `lib/x-api/enhanced-client.ts` and simple local analysis functions.
  - Produces an `InvestigationResult` with `userProfile`, `userPosts`, `followerNetwork`, `similarAccounts`, and an `executionLog` suitable for audit/debugging.

- `lib/agents/debate-orchestrator.ts` (`MultiTurnDebateOrchestrator`):
  - Phase 1: runs `investigator.investigate(content)` and logs plan + results.
  - Phase 2: executes up to `maxRounds` (default 5) of back-and-forth debate using:
    - `PROSECUTOR_MULTI_TURN_PROMPT` and `DEFENDER_MULTI_TURN_PROMPT` (inline strings) to steer each side.
    - A simple confidence-based convergence heuristic (no external arbiter model call for convergence).
  - Phase 3: computes a final score, classification, action, and reasoning summary from the last round + investigation signals.

`debateOrchestrator.runDebate(XContent)` is therefore the high-cost, high-context path appropriate for deeper investigations, while `runAgentDebate` is the primary single-pass pipeline used throughout the test scripts.

### X API integration (`lib/x-api`)

There are two distinct X API clients built on `@xdevplatform/xdk`:

- `lib/x-api/client.ts` (`XAPIClient` + exported singleton `xApiClient`):
  - Focused on a simpler enrichment workflow (`getEnrichedUser`, `getUserPosts`).
  - Computes a compact `enrichedData` structure with an `isLikelyLegitimate` score and signals, plus basic verification API-limitation detection.
  - Used heavily in `test-real-fixed.ts` to pre-score accounts and decide whether to skip the full GrokGuard debate for obviously legitimate profiles.

- `lib/x-api/enhanced-client.ts` (`EnhancedXAPIClient` + singleton `enhancedXApiClient`):
  - Provides a much more detailed `EnrichedUserData` model with temporal, network, activity, profile-quality, verification, scam-risk, and API-limitation fields.
  - Implements a comprehensive `legitimacyScore` and `riskLevel` using dozens of positive/negative factors, and a `dataCompleteness` metric.
  - Powers the `test-enhanced.ts` script and the `InvestigatorAgent` tool calls.

Both clients rely on `X_API_BEARER_TOKEN` and assume bearer-token level access; several analysis docs in the repo highlight how limited data (e.g., missing posts or incorrect verification) can still lead to logically consistent—but practically false-positive—classifications.

### Test & demo scripts (repo root)

The root-level `test-*.ts` scripts are the main way to exercise the system today:
- `test-agent-system.ts` – runs synthetic scenarios through the basic 5-agent pipeline and prints a summary table.
- `test-apis.ts` – validates X API and Grok/Grok Vision connectivity.
- `test-enhanced.ts` – inspects real accounts via `EnhancedXAPIClient` and prints a detailed legitimacy breakdown.
- `test-real-x-simple.ts` – runs the 5-agent debate on a fixed set of real profiles.
- `test-real-x-data.ts` – fetches real posts and profiles (including trending content) and evaluates them.
- `test-real-fixed.ts` – “fixed” real-account flow that pre-scores legitimacy to avoid misclassifying well-known accounts.

When adding new capabilities or tests, follow this pattern: construct an `XContent` instance from X API data (or synthetic input), then pass it into either `runAgentDebate` or `debateOrchestrator.runDebate` and log the resulting `DetectionResult`/`MultiTurnDebateResult` in a new `test-*.ts` script.
