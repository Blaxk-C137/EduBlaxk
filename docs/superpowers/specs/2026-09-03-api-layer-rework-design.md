# EduBLAXK API Layer Rework — Design

**Date:** 2026-09-03
**Status:** Approved design, pending implementation plan
**Branch:** Fresh-rework

## Problem

EduBLAXK's AI layer has five concrete problems, all confirmed against the code:

1. **Invalid model + escalating fallback chain** (`server.ts:35-40`): `gemini-3.7-flash` does not exist, and the cascade ends on `gemini-2.5-pro`, silently escalating students from a free flash model to the most expensive tier on retry.
2. **Blind retries** (`server.ts:43-94`, `server.ts:326-370`): every error — including invalid-key (401/400) — triggers 4 retries across 4 models, wasting quota and time. 429 rate-limit errors get *worse* under the cascade.
3. **Documents round-trip everything**: full base64 PDFs ride in JSON request bodies (100MB limit), the model receives raw PDFs, and the generated quiz stores `dataUrl`/`textContent`/`documents` back into localStorage — filling student vaults and crashing large sessions.
4. **No usage accounting**: no token counts, no request counts, no cost/quota visibility. Students hit free-tier limits with no warning.
5. **Hard Gemini coupling**: provider SDK, key header, model names, and response schemas are woven through every route; adding Anthropic/OpenAI means touching every endpoint.

## Goals

- Multi-provider support (Gemini, Anthropic, OpenAI) behind one abstraction, Gemini as the working default (the only free key the maintainer holds)
- Cost-effective usage: server-side text extraction instead of native PDFs, valid models only, tier-aware fallbacks, no blind retries
- Persistent usage ledger + student-facing dashboard with free-tier guardrails
- Server-side key storage (paste once, never stored in the browser)
- **Local-first constraint:** all student data (quizzes, attempts, question bank, vault, preferences) stays in browser localStorage. The server is a local companion holding only: API keys, usage records, and extracted-text cache.

## Non-Goals

- No multi-user accounts / server-side auth — single student, local machine
- No streaming UI for quiz generation in this phase
- No gateway/OpenRouter dependency
- No migration of existing localStorage data (old quizzes keep their stored `documents` field; new ones stop storing it)

## Architecture

### Approach (approved): Vercel AI SDK multi-provider layer

Use the `ai` package with `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/openai`. Rationale:

- `generateObject` with Zod schemas gives uniform structured output across all three providers (replaces per-provider responseSchema code)
- Every result returns `usage.inputTokens`/`usage.outputTokens` uniformly — the usage ledger falls out for free
- Model selection becomes a `"provider:model"` string; retries/fallback get one shared implementation

### Server structure

```
server.ts                  — Express app + route wiring only
server/
  ai/
    catalog.ts             — model catalog (see Model Catalog)
    router.ts              — selection parsing, client construction, retry/fallback policy
    schemas.ts             — Zod schemas: quiz, theory evaluation
  config/
    keys.ts                — load/save provider keys + active selection to .edublaxk/keys.json
    usage.ts               — append usage records to .edublaxk/usage.json
  documents/
    extract.ts             — pdf-parse text extraction + sha256 content-hash cache in .edublaxk/doc-cache/
```

`.edublaxk/` lives at the project root, gitignored (added to `.gitignore`).

### Frontend changes

- `src/lib/api.ts` — no longer sends `x-gemini-api-key`; sends `x-model` (the `"provider:model"` selection) only
- `SettingsModal` + `SetupWizard` — provider dropdown → model dropdown (fed by `GET /api/models`) → key field that POSTs once
- New `UsagePanel` component — the usage/cost dashboard
- `types.ts` — `UserPreferences.apiKey` removed; `preferredModel` becomes the full `"provider:model"` string

### Local-first guarantees

- Quizzes, attempts, question bank, preferences: browser localStorage, unchanged keys and shapes (except `Quiz.documents` is dropped from *new* quizzes)
- App remains fully usable offline for reviewing history, quizzes, question bank, reports
- No telemetry; the only external calls are to the student's chosen AI provider

## Model Catalog

`catalog.ts` exports a static list. Each entry:

```ts
{
  id: "google:gemini-2.5-flash",     // provider:model
  provider: "google",
  label: "Gemini 2.5 Flash",
  pricing: { input: 0.30, output: 2.50 },   // USD per million tokens
  freeTier: { rpm: 10, rpd: 250 },          // null for paid-only providers
  tier: "fast",                              // fast | balanced | premium
  fallbacks: ["google:gemini-2.5-flash-lite"], // same-or-cheaper tier, same provider
}
```

Initial catalog (pricing verified at implementation time from provider pricing pages):

| id | label | $/MTok in/out | free tier | tier |
|---|---|---|---|---|
| `google:gemini-2.5-flash` | Gemini 2.5 Flash | 0.30 / 2.50 | 10 RPM, 250 RPD | fast |
| `google:gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | 0.10 / 0.40 | 15 RPM, 1000 RPD | fast |
| `anthropic:claude-haiku-4-5` | Claude Haiku 4.5 | 1.00 / 5.00 | — | balanced |
| `anthropic:claude-sonnet-5` | Claude Sonnet 5 | 2.00 / 10.00 | — | balanced |
| `openai:gpt-5-mini` | GPT-5 mini | verify | — | fast |

Default selection: `google:gemini-2.5-flash`. **No pro/premium model ever appears in a fallback chain.** A premium model can only run if the student explicitly selects it.

## Data Flow

### Key setup (once)

1. Wizard/settings: choose provider → paste key → `POST /api/keys` `{ provider, apiKey, model }`
2. Server validates with a minimal 1-token ping via the AI SDK
3. On success, server writes `.edublaxk/keys.json` `{ providers: { google: "…", anthropic: "…" }, activeModel: "google:gemini-2.5-flash" }` (mode 0600)
4. Key never enters localStorage and never travels on subsequent requests

Endpoints: `GET /api/config` (which providers have keys, active model — never the keys themselves), `POST /api/keys`, `DELETE /api/keys/:provider`.

### Quiz generation

1. Client uploads files as base64 in JSON, **capped at 20MB total per request** (server enforces; express body limit lowered to 20mb)
2. Server hashes each file (sha256 of the bytes) → cache hit returns cached text; miss extracts text with `pdf-parse` (text files pass through) → cache to `.edublaxk/doc-cache/<hash>.txt`
3. Extracted **text only** goes to `generateObject` with the Zod quiz schema; document text truncated at a catalog/model-appropriate cap (~120k characters), with a warning surfaced if truncation occurred
4. Response quiz contains `documentNames` only — no `documents`, no `dataUrl`, no `textContent`
5. "More fresh questions" on the same document = student re-picks the file from disk; the hash cache makes extraction instant, and deduplication still uses the client-side question bank (`excludedQuestions` unchanged, capped at 75)

### Theory evaluation / Ask tutor

Same as today's shapes, routed through the shared AI router with the active model; usage recorded per call.

## Error Handling & Retry Policy

One classifier in `router.ts`, driven by AI SDK error types (the SDK normalizes provider errors to `AISDKError` subclasses with HTTP status):

| Classification | Detection | Action |
|---|---|---|
| Auth | 401/403, invalid-key messages | Fail fast, clear message ("Your <provider> key is invalid — update it in Settings"), no retries |
| Rate limit | 429 / RESOURCE_EXHAUSTED | Exponential backoff with jitter, max 2 retries; then "Free-tier limit hit — wait ~N minutes or switch model" (N from free-tier RPM) |
| Overloaded | 503 / UNAVAILABLE / overloaded | 1 retry on same model, then next model in `fallbacks` (same provider, same-or-cheaper tier) |
| Parse failure | Zod validation error on generateObject | 1 repair retry (re-prompt with the validation error), then clean error |
| Everything else | — | Fail fast with the provider's message |

The old `FALLBACK_MODELS` cascade and `chatWithFallback` are deleted.

## Usage Ledger & Dashboard

`.edublaxk/usage.json` — append-only array of records:

```json
{ "ts": "2026-09-03T14:22:01Z", "model": "google:gemini-2.5-flash",
  "endpoint": "generate-quiz", "inputTokens": 18432, "outputTokens": 2107,
  "estCostUsd": 0.0103, "success": true }
```

`GET /api/usage` aggregates; `UsagePanel` (accessible from Settings) shows:

- Requests and tokens today / this month
- Estimated cost per provider/model (Gemini free tier shows consumption, $0 until limits)
- Per-model breakdown table
- Free-tier guardrail: when today's request count for the active model crosses ~80% of its catalog `rpd`, a warning banner appears in the panel and on the generate screen before the next generation

Ledger rotation: if `usage.json` exceeds ~5MB, records older than 90 days are pruned on server start.

## Testing

- **Unit** (vitest): selection-string parsing and catalog lookup; error classifier (each class → correct action); usage aggregation math; extraction cache hit/miss via temp dir
- **Integration**: all routes against a mocked AI SDK provider (custom `LanguageModel` test double) — happy paths, auth failure, 429 backoff, overload fallback, parse-repair, 20MB cap enforcement, key persistence round-trip
- **Manual smoke**: one real Gemini-key run per endpoint (generate-quiz with a PDF, evaluate-theory, ask-tutor, key validation) before merge

## Migration / Compatibility

- Existing localStorage attempts and question bank are untouched; old quizzes with stored `documents` still render (the field is optional)
- `.env` `GEMINI_API_KEY` remains supported: on first boot, if `.edublaxk/keys.json` doesn't exist but `GEMINI_API_KEY` is set, the server seeds the google provider key from it
- `preferredModel` values like `gemini-2.5-flash` (old format) are mapped to `google:gemini-2.5-flash` on read; unknown values fall back to the default
