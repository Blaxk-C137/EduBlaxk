# EduBLAXK API Layer Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gemini-hardcoded, blind-retrying, base64-bloated AI layer with a multi-provider (Gemini/Anthropic/OpenAI) Vercel AI SDK layer that has server-side keys, server-side PDF text extraction with caching, a persistent usage ledger, and a cost dashboard — while keeping all student data in browser localStorage.

**Architecture:** Express server split into `server/ai` (model catalog, retry policy, Zod schemas), `server/config` (keys.json, usage.json), and `server/documents` (pdf extraction + hash cache). Frontend keeps localStorage as source of truth; keys never enter the browser.

**Tech Stack:** TypeScript, Express, Vite/React 19, Vercel AI SDK (`ai` + `@ai-sdk/google`/`@ai-sdk/anthropic`/`@ai-sdk/openai`), Zod, `unpdf`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-api-layer-rework-design.md` — read it before starting; this plan argues from it.

## Global Constraints

- All server-side state lives under one data dir: `process.env.EDUBLAXK_DATA_DIR` if set, else `<project>/.edublaxk/`. That dir is gitignored. Every module that touches disk accepts an optional `baseDir` parameter (tests pass a temp dir).
- Model IDs are always `"provider:model"` strings (e.g. `google:gemini-2.5-flash`). Catalog contains **only real model IDs** — `gemini-3.7-flash` must not reappear anywhere.
- Fallback chains never include a higher tier than the selected model (a "fast" model falls back only to "fast").
- Request body limit is 20MB (server) and 20MB total upload cap (client) — replacing the old 100MB.
- Quizzes returned by `/api/generate-quiz` contain `documentNames` only — never `documents`, `dataUrl`, or `textContent` of uploads.
- API keys are stored **only** in `.edublaxk/keys.json` (mode 0600). Never logged, never sent to the client, never stored in localStorage.
- The client sends model selection via the `x-model` header (`"provider:model"`); the server falls back to `keys.activeModel` when absent.
- `server.ts` must not start listening when `process.env.VITEST` is set (route tests import the app).
- Existing localStorage data (attempts, question bank, saved quizzes) must keep working; old quizzes with a `documents` field still render (keep the field optional in types).
- Verify the `openai:gpt-5-mini` catalog pricing against OpenAI's pricing page during Task 2; fix the number there if the plan's value is stale.

---

### Task 1: Test infrastructure and dependencies

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vitest.config.ts`
- Modify: `.gitignore`
- Create: `tests/sanity.test.ts`

**Interfaces:**
- Produces: `npm test` runs vitest; all later tasks rely on this.

- [ ] **Step 1: Install dependencies**

```bash
npm install ai @ai-sdk/google @ai-sdk/anthropic @ai-sdk/openai zod unpdf
npm install -D vitest
```

- [ ] **Step 2: Add test script to package.json**

In `package.json` scripts add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add .edublaxk/ to .gitignore**

Append to `.gitignore`:

```
.edublaxk/
```

- [ ] **Step 5: Write sanity test `tests/sanity.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 7: Verify TypeScript still compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore tests/sanity.test.ts
git commit -m "chore: add vitest, AI SDK and unpdf dependencies"
```

---

### Task 2: Model catalog

**Files:**
- Create: `server/ai/catalog.ts`
- Test: `tests/catalog.test.ts`

**Interfaces:**
- Produces (used by Tasks 4, 5, 7, 8, 9, 12):
  - `type ProviderId = "google" | "anthropic" | "openai"`
  - `interface ModelEntry { id: string; provider: ProviderId; label: string; pricing: { input: number; output: number }; freeTier: { rpm: number; rpd: number } | null; tier: "fast" | "balanced" | "premium"; fallbacks: string[] }`
  - `const DEFAULT_MODEL: string` (`"google:gemini-2.5-flash"`)
  - `const PROVIDER_LABELS: Record<ProviderId, string>`
  - `const MODEL_CATALOG: ModelEntry[]`
  - `function findModel(id: string): ModelEntry | undefined`
  - `function normalizeLegacyModel(raw?: string): string`
  - `function estimateCostUsd(entry: ModelEntry, inputTokens: number, outputTokens: number): number`

- [ ] **Step 1: Write failing tests `tests/catalog.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { MODEL_CATALOG, findModel, normalizeLegacyModel, estimateCostUsd, DEFAULT_MODEL } from "../server/ai/catalog";

describe("model catalog", () => {
  it("finds models by provider:model id", () => {
    expect(findModel("google:gemini-2.5-flash")?.label).toBe("Gemini 2.5 Flash");
    expect(findModel("anthropic:claude-haiku-4-5")?.provider).toBe("anthropic");
  });

  it("returns undefined for unknown ids", () => {
    expect(findModel("google:gemini-3.7-flash")).toBeUndefined();
  });

  it("contains no nonexistent gemini-3.7 model", () => {
    expect(MODEL_CATALOG.some((m) => m.id.includes("3.7"))).toBe(false);
  });

  it("maps legacy bare model names to provider-qualified ids", () => {
    expect(normalizeLegacyModel("gemini-2.5-flash")).toBe("google:gemini-2.5-flash");
    expect(normalizeLegacyModel("gemini-2.5-pro")).toBe("google:gemini-2.5-flash");
    expect(normalizeLegacyModel("gemini-2.0-flash")).toBe("google:gemini-2.5-flash");
  });

  it("defaults unknown or missing values to the default model", () => {
    expect(normalizeLegacyModel(undefined)).toBe(DEFAULT_MODEL);
    expect(normalizeLegacyModel("auto")).toBe(DEFAULT_MODEL);
    expect(normalizeLegacyModel("gpt-9-turbo")).toBe(DEFAULT_MODEL);
  });

  it("never falls back to a higher tier than the selected model", () => {
    for (const entry of MODEL_CATALOG) {
      const tierRank = { fast: 0, balanced: 1, premium: 2 } as const;
      for (const fb of entry.fallbacks) {
        const fbEntry = findModel(fb);
        expect(fbEntry, `fallback ${fb} of ${entry.id} must exist in catalog`).toBeDefined();
        expect(tierRank[fbEntry!.tier]).toBeLessThanOrEqual(tierRank[entry.tier]);
        expect(fbEntry!.provider).toBe(entry.provider);
      }
    }
  });

  it("estimates cost from per-million pricing", () => {
    const entry = findModel("google:gemini-2.5-flash")!;
    // 1M input tokens at $0.30 + 1M output tokens at $2.50 = $2.80
    expect(estimateCostUsd(entry, 1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/catalog.test.ts`
Expected: FAIL — cannot resolve `../server/ai/catalog`.

- [ ] **Step 3: Implement `server/ai/catalog.ts`**

```typescript
export type ProviderId = "google" | "anthropic" | "openai";

export interface ModelEntry {
  id: string; // "provider:model"
  provider: ProviderId;
  label: string;
  pricing: { input: number; output: number }; // USD per million tokens
  freeTier: { rpm: number; rpd: number } | null;
  tier: "fast" | "balanced" | "premium";
  fallbacks: string[]; // same provider, same-or-cheaper tier only
}

export const DEFAULT_MODEL = "google:gemini-2.5-flash";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "google:gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash",
    pricing: { input: 0.3, output: 2.5 },
    freeTier: { rpm: 10, rpd: 250 },
    tier: "fast",
    fallbacks: ["google:gemini-2.5-flash-lite"],
  },
  {
    id: "google:gemini-2.5-flash-lite",
    provider: "google",
    label: "Gemini 2.5 Flash-Lite",
    pricing: { input: 0.1, output: 0.4 },
    freeTier: { rpm: 15, rpd: 1000 },
    tier: "fast",
    fallbacks: [],
  },
  {
    id: "anthropic:claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    pricing: { input: 1.0, output: 5.0 },
    freeTier: null,
    tier: "balanced",
    fallbacks: [],
  },
  {
    id: "anthropic:claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    pricing: { input: 2.0, output: 10.0 },
    freeTier: null,
    tier: "balanced",
    fallbacks: ["anthropic:claude-haiku-4-5"],
  },
  {
    id: "openai:gpt-5-mini",
    provider: "openai",
    label: "GPT-5 mini",
    pricing: { input: 0.25, output: 2.0 }, // TODO(verify): check OpenAI pricing page before merge
    freeTier: null,
    tier: "fast",
    fallbacks: [],
  },
];

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

// Old preferences stored bare Gemini names; map them to provider-qualified ids.
// Unknown/retired models map to the default — never to a premium tier.
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "google:gemini-2.5-flash",
  "gemini-2.5-flash-lite": "google:gemini-2.5-flash-lite",
  "gemini-2.5-pro": "google:gemini-2.5-flash",
  "gemini-2.0-flash": "google:gemini-2.5-flash",
};

export function normalizeLegacyModel(raw?: string): string {
  if (!raw) return DEFAULT_MODEL;
  if (findModel(raw)) return raw;
  return LEGACY_MODEL_MAP[raw] ?? DEFAULT_MODEL;
}

export function estimateCostUsd(entry: ModelEntry, inputTokens: number, outputTokens: number): number {
  return (inputTokens * entry.pricing.input + outputTokens * entry.pricing.output) / 1_000_000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/catalog.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/catalog.ts tests/catalog.test.ts
git commit -m "feat(ai): add multi-provider model catalog with tier-safe fallbacks"
```

---

### Task 3: Zod schemas for structured output

**Files:**
- Create: `server/ai/schemas.ts`
- Test: `tests/schemas.test.ts`

**Interfaces:**
- Produces (used by Tasks 7, 8):
  - `const quizSchema: z.ZodObject<...>` with fields `title`, `summary`, `topicsCovered: string[]`, `questions: Array<{id, type: "mcq"|"theory", question, options: string[], correctAnswerIndex: number, explanation, sourceContext, modelAnswer, theoryRubric: string[], topic, difficulty}>`
  - `const evaluationSchema: z.ZodObject<...>` with fields `score`, `maxScore`, `percentage`, `feedback`, `keyPointsAddressed: string[]`, `missingKeyPoints: string[]`, `improvementTips: string[]`
  - `type QuizResult = z.infer<typeof quizSchema>`, `type EvaluationResult = z.infer<typeof evaluationSchema>`

- [ ] **Step 1: Write failing tests `tests/schemas.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { quizSchema, evaluationSchema } from "../server/ai/schemas";

const validQuiz = {
  title: "Cell Biology Basics",
  summary: "Covers organelles and mitosis",
  topicsCovered: ["Organelles", "Mitosis"],
  questions: [
    {
      id: "q-1",
      type: "mcq",
      question: "Which organelle produces ATP?",
      options: ["Mitochondrion", "Ribosome", "Nucleus", "Lysosome"],
      correctAnswerIndex: 0,
      explanation: "Mitochondria carry out oxidative phosphorylation.",
      sourceContext: "Chapter 2, p. 31",
      modelAnswer: "",
      theoryRubric: [],
      topic: "Organelles",
      difficulty: "medium",
    },
    {
      id: "q-2",
      type: "theory",
      question: "Explain the stages of mitosis.",
      options: [],
      correctAnswerIndex: -1,
      explanation: "Prophase, metaphase, anaphase, telophase.",
      sourceContext: "Chapter 3",
      modelAnswer: "Mitosis proceeds through prophase...",
      theoryRubric: ["Names all four stages", "Describes chromosome behavior"],
      topic: "Mitosis",
      difficulty: "hard",
    },
  ],
};

describe("quizSchema", () => {
  it("accepts a well-formed quiz", () => {
    expect(quizSchema.parse(validQuiz).questions).toHaveLength(2);
  });

  it("rejects an unknown question type", () => {
    const bad = { ...validQuiz, questions: [{ ...validQuiz.questions[0], type: "essay" }] };
    expect(() => quizSchema.parse(bad)).toThrow();
  });

  it("rejects a quiz with no questions array", () => {
    const { questions, ...noQuestions } = validQuiz;
    expect(() => quizSchema.parse(noQuestions)).toThrow();
  });
});

describe("evaluationSchema", () => {
  it("accepts a well-formed evaluation", () => {
    const evaluation = evaluationSchema.parse({
      score: 4,
      maxScore: 5,
      percentage: 80,
      feedback: "Good structure, missed one rubric point.",
      keyPointsAddressed: ["Names stages"],
      missingKeyPoints: ["Chromosome behavior"],
      improvementTips: ["Review anaphase"],
    });
    expect(evaluation.score).toBe(4);
  });

  it("rejects a missing feedback field", () => {
    expect(() => evaluationSchema.parse({ score: 4, maxScore: 5, percentage: 80 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/schemas.test.ts`
Expected: FAIL — cannot resolve `../server/ai/schemas`.

- [ ] **Step 3: Implement `server/ai/schemas.ts`**

```typescript
import { z } from "zod";

export const quizSchema = z.object({
  title: z.string().describe("Descriptive title for this quiz based on document content"),
  summary: z.string().describe("A concise overview of the concepts and domains tested in this quiz"),
  topicsCovered: z.array(z.string()).describe("Key topics/chapters covered in this quiz"),
  questions: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["mcq", "theory"]),
        question: z.string(),
        options: z.array(z.string()).describe("4 options for MCQ (empty array for theory)"),
        correctAnswerIndex: z.number().int().describe("0-3 index of correct option for MCQ (-1 for theory)"),
        explanation: z.string().describe("In-depth explanation of the correct answer"),
        sourceContext: z.string().describe("Relevant quote or page reference from the source document"),
        modelAnswer: z.string().describe("Exemplary answer for theory questions (empty for MCQ)"),
        theoryRubric: z.array(z.string()).describe("Key grading criteria for theory questions (empty for MCQ)"),
        topic: z.string(),
        difficulty: z.string(),
      })
    )
    .describe("Assessment questions"),
});

export const evaluationSchema = z.object({
  score: z.number().describe("Awarded score from 0 to maxScore"),
  maxScore: z.number(),
  percentage: z.number().describe("Percentage score 0 to 100"),
  feedback: z.string().describe("Constructive feedback and critique"),
  keyPointsAddressed: z.array(z.string()).describe("Rubric criteria or key concepts the student got right"),
  missingKeyPoints: z.array(z.string()).describe("Key points the student missed or explained incorrectly"),
  improvementTips: z.array(z.string()).describe("Concrete tips for revision"),
});

export type QuizResult = z.infer<typeof quizSchema>;
export type EvaluationResult = z.infer<typeof evaluationSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/schemas.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/schemas.ts tests/schemas.test.ts
git commit -m "feat(ai): add Zod schemas for quiz and evaluation structured output"
```

---

### Task 4: Server-side key config

**Files:**
- Create: `server/config/keys.ts`
- Test: `tests/keys.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `DEFAULT_MODEL`, `normalizeLegacyModel` from `server/ai/catalog` (Task 2)
- Produces (used by Tasks 5, 6, 7, 8):
  - `interface KeysFile { providers: Partial<Record<ProviderId, string>>; activeModel: string }`
  - `function dataDir(baseDir?: string): string`
  - `function loadKeys(baseDir?: string): KeysFile`
  - `function saveKeys(keys: KeysFile, baseDir?: string): void`
  - `function setProviderKey(provider: ProviderId, apiKey: string, baseDir?: string): KeysFile`
  - `function removeProviderKey(provider: ProviderId, baseDir?: string): KeysFile`
  - `function setActiveModel(modelId: string, baseDir?: string): KeysFile`
  - `function getApiKey(provider: ProviderId, baseDir?: string): string | undefined`

- [ ] **Step 1: Write failing tests `tests/keys.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { loadKeys, setProviderKey, removeProviderKey, setActiveModel, getApiKey, keysPath } from "../server/config/keys";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "edublaxk-keys-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("keys config", () => {
  it("returns empty providers and the default model when no file exists", () => {
    const keys = loadKeys(tmpDir);
    expect(keys.providers).toEqual({});
    expect(keys.activeModel).toBe("google:gemini-2.5-flash");
  });

  it("round-trips a provider key", () => {
    setProviderKey("google", "AIzaSy-test-key", tmpDir);
    expect(getApiKey("google", tmpDir)).toBe("AIzaSy-test-key");
    expect(getApiKey("anthropic", tmpDir)).toBeUndefined();
  });

  it("writes keys.json with mode 0600", () => {
    setProviderKey("google", "AIzaSy-test-key", tmpDir);
    const stat = fs.statSync(keysPath(tmpDir));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("removes a provider key without touching others", () => {
    setProviderKey("google", "g-key", tmpDir);
    setProviderKey("anthropic", "a-key", tmpDir);
    removeProviderKey("google", tmpDir);
    expect(getApiKey("google", tmpDir)).toBeUndefined();
    expect(getApiKey("anthropic", tmpDir)).toBe("a-key");
  });

  it("normalizes a legacy active model value on load", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(keysPath(tmpDir), JSON.stringify({ providers: {}, activeModel: "gemini-2.5-pro" }));
    expect(loadKeys(tmpDir).activeModel).toBe("google:gemini-2.5-flash");
  });

  it("seeds the google key from GEMINI_API_KEY env on first load", () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "AIzaSy-from-env";
    try {
      const keys = loadKeys(tmpDir);
      expect(keys.providers.google).toBe("AIzaSy-from-env");
      // seeded file persists
      expect(JSON.parse(fs.readFileSync(keysPath(tmpDir), "utf-8")).providers.google).toBe("AIzaSy-from-env");
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prev;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/keys.test.ts`
Expected: FAIL — cannot resolve `../server/config/keys`.

- [ ] **Step 3: Implement `server/config/keys.ts`**

```typescript
import fs from "fs";
import path from "path";
import { DEFAULT_MODEL, normalizeLegacyModel, ProviderId } from "../ai/catalog";

export interface KeysFile {
  providers: Partial<Record<ProviderId, string>>;
  activeModel: string;
}

export function dataDir(baseDir?: string): string {
  return baseDir ?? process.env.EDUBLAXK_DATA_DIR ?? path.resolve(process.cwd(), ".edublaxk");
}

export function keysPath(baseDir?: string): string {
  return path.join(dataDir(baseDir), "keys.json");
}

export function saveKeys(keys: KeysFile, baseDir?: string): void {
  const dir = dataDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keysPath(baseDir), JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export function loadKeys(baseDir?: string): KeysFile {
  try {
    const raw = fs.readFileSync(keysPath(baseDir), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      providers: parsed.providers ?? {},
      activeModel: normalizeLegacyModel(parsed.activeModel),
    };
  } catch {
    // First boot: seed the google key from .env so existing users keep working.
    const envKey = process.env.GEMINI_API_KEY?.trim();
    if (envKey) {
      const seeded: KeysFile = { providers: { google: envKey }, activeModel: DEFAULT_MODEL };
      saveKeys(seeded, baseDir);
      return seeded;
    }
    return { providers: {}, activeModel: DEFAULT_MODEL };
  }
}

export function setProviderKey(provider: ProviderId, apiKey: string, baseDir?: string): KeysFile {
  const keys = loadKeys(baseDir);
  keys.providers[provider] = apiKey.trim();
  saveKeys(keys, baseDir);
  return keys;
}

export function removeProviderKey(provider: ProviderId, baseDir?: string): KeysFile {
  const keys = loadKeys(baseDir);
  delete keys.providers[provider];
  saveKeys(keys, baseDir);
  return keys;
}

export function setActiveModel(modelId: string, baseDir?: string): KeysFile {
  const keys = loadKeys(baseDir);
  keys.activeModel = normalizeLegacyModel(modelId);
  saveKeys(keys, baseDir);
  return keys;
}

export function getApiKey(provider: ProviderId, baseDir?: string): string | undefined {
  return loadKeys(baseDir).providers[provider];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/keys.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/config/keys.ts tests/keys.test.ts
git commit -m "feat(config): server-side API key storage with .env seeding"
```

---

### Task 5: Usage ledger

**Files:**
- Create: `server/config/usage.ts`
- Test: `tests/usage.test.ts`

**Interfaces:**
- Consumes: `findModel`, `estimateCostUsd`, `DEFAULT_MODEL` from Task 2; `dataDir` from Task 4
- Produces (used by Tasks 7, 8, 12):
  - `interface UsageRecord { ts: string; model: string; endpoint: string; inputTokens: number; outputTokens: number; estCostUsd: number; success: boolean }`
  - `interface UsageSummary { today: UsageBucket; month: UsageBucket; perModel: Array<UsageBucket & { model: string }>; freeTier: { model: string; requestsToday: number; rpd: number; warning: boolean } | null }` where `UsageBucket = { requests: number; inputTokens: number; outputTokens: number; estCostUsd: number; failedRequests: number }`
  - `function recordUsage(rec: Omit<UsageRecord, "estCostUsd">, baseDir?: string): UsageRecord`
  - `function loadUsage(baseDir?: string): UsageRecord[]`
  - `function aggregateUsage(records: UsageRecord[], activeModel?: string, now?: Date): UsageSummary`
  - `function pruneUsage(baseDir?: string): void`

- [ ] **Step 1: Write failing tests `tests/usage.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { recordUsage, loadUsage, aggregateUsage, usagePath, pruneUsage, UsageRecord } from "../server/config/usage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "edublaxk-usage-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("usage ledger", () => {
  it("computes estimated cost from catalog pricing", () => {
    const rec = recordUsage(
      { ts: "2026-09-03T10:00:00Z", model: "google:gemini-2.5-flash", endpoint: "generate-quiz", inputTokens: 1_000_000, outputTokens: 1_000_000, success: true },
      tmpDir
    );
    expect(rec.estCostUsd).toBeCloseTo(2.8, 5);
  });

  it("appends records and loads them back", () => {
    recordUsage({ ts: "2026-09-03T10:00:00Z", model: "google:gemini-2.5-flash", endpoint: "generate-quiz", inputTokens: 100, outputTokens: 50, success: true }, tmpDir);
    recordUsage({ ts: "2026-09-03T11:00:00Z", model: "google:gemini-2.5-flash", endpoint: "ask-tutor", inputTokens: 200, outputTokens: 80, success: false }, tmpDir);
    const all = loadUsage(tmpDir);
    expect(all).toHaveLength(2);
    expect(all[1].success).toBe(false);
  });

  it("aggregates today vs month vs per-model", () => {
    const records: UsageRecord[] = [
      { ts: "2026-09-03T10:00:00Z", model: "google:gemini-2.5-flash", endpoint: "generate-quiz", inputTokens: 1000, outputTokens: 500, estCostUsd: 0.001, success: true },
      { ts: "2026-09-03T11:00:00Z", model: "google:gemini-2.5-flash", endpoint: "ask-tutor", inputTokens: 200, outputTokens: 100, estCostUsd: 0.0005, success: true },
      { ts: "2026-08-15T10:00:00Z", model: "anthropic:claude-haiku-4-5", endpoint: "generate-quiz", inputTokens: 3000, outputTokens: 1500, estCostUsd: 0.01, success: true },
    ];
    const summary = aggregateUsage(records, "google:gemini-2.5-flash", new Date("2026-09-03T20:00:00Z"));
    expect(summary.today.requests).toBe(2);
    expect(summary.today.inputTokens).toBe(1200);
    expect(summary.month.requests).toBe(3); // August 15 is within the trailing month window? No - month = same calendar month
    expect(summary.perModel).toHaveLength(2);
  });

  it("flags free-tier warning at 80% of daily requests", () => {
    const records: UsageRecord[] = Array.from({ length: 205 }, (_, i) => ({
      ts: "2026-09-03T10:00:00Z",
      model: "google:gemini-2.5-flash",
      endpoint: "generate-quiz",
      inputTokens: 10,
      outputTokens: 5,
      estCostUsd: 0,
      success: true,
    }));
    // 205 of 250 daily requests for ALL time today on that model = 82% -> warning
    const summary = aggregateUsage(records, "google:gemini-2.5-flash", new Date("2026-09-03T20:00:00Z"));
    expect(summary.freeTier).not.toBeNull();
    expect(summary.freeTier!.warning).toBe(true);
    expect(summary.freeTier!.requestsToday).toBe(205);
  });

  it("returns null freeTier for models without a free tier", () => {
    const summary = aggregateUsage([], "anthropic:claude-sonnet-5", new Date("2026-09-03T20:00:00Z"));
    expect(summary.freeTier).toBeNull();
  });

  it("prunes records older than 90 days when the ledger exceeds 5MB", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const oldRecord: UsageRecord = { ts: "2026-01-01T00:00:00Z", model: "google:gemini-2.5-flash", endpoint: "x", inputTokens: 0, outputTokens: 0, estCostUsd: 0, success: true };
    const newRecord: UsageRecord = { ts: "2026-09-01T00:00:00Z", model: "google:gemini-2.5-flash", endpoint: "x", inputTokens: 0, outputTokens: 0, estCostUsd: 0, success: true };
    // Pad the file past 5MB with a large filler string so the size trigger fires
    const big: UsageRecord = { ...oldRecord, endpoint: "y".repeat(60) };
    const many = Array.from({ length: 90_000 }, () => big);
    fs.writeFileSync(usagePath(tmpDir), JSON.stringify([...many, oldRecord, newRecord]));
    pruneUsage(tmpDir, new Date("2026-09-03T00:00:00Z"));
    const remaining = loadUsage(tmpDir);
    expect(remaining.some((r) => r.ts === "2026-01-01T00:00:00Z")).toBe(false);
    expect(remaining.some((r) => r.ts === "2026-09-01T00:00:00Z")).toBe(true);
  });
});
```

Note on the `month` assertion: "month" means **same calendar month as `now`** (September 2026 in the test), so August 15 is excluded and `month.requests` is 2, not 3 — fix the assertion while implementing:

```typescript
expect(summary.month.requests).toBe(2); // August 15 falls outside the September calendar month
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/usage.test.ts`
Expected: FAIL — cannot resolve `../server/config/usage`.

- [ ] **Step 3: Implement `server/config/usage.ts`**

```typescript
import fs from "fs";
import path from "path";
import { DEFAULT_MODEL, estimateCostUsd, findModel } from "../ai/catalog";
import { dataDir } from "./keys";

export interface UsageRecord {
  ts: string; // ISO timestamp
  model: string; // "provider:model"
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  success: boolean;
}

export interface UsageBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  failedRequests: number;
}

export interface UsageSummary {
  today: UsageBucket;
  month: UsageBucket;
  perModel: Array<UsageBucket & { model: string }>;
  freeTier: { model: string; requestsToday: number; rpd: number; warning: boolean } | null;
}

export function usagePath(baseDir?: string): string {
  return path.join(dataDir(baseDir), "usage.json");
}

export function loadUsage(baseDir?: string): UsageRecord[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(usagePath(baseDir), "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordUsage(rec: Omit<UsageRecord, "estCostUsd">, baseDir?: string): UsageRecord {
  const entry = findModel(rec.model);
  const full: UsageRecord = {
    ...rec,
    estCostUsd: entry ? estimateCostUsd(entry, rec.inputTokens, rec.outputTokens) : 0,
  };
  const dir = dataDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(usagePath(baseDir), JSON.stringify([...loadUsage(baseDir), full], null, 2), { mode: 0o600 });
  return full;
}

const EMPTY_BUCKET: UsageBucket = { requests: 0, inputTokens: 0, outputTokens: 0, estCostUsd: 0, failedRequests: 0 };

function addTo(bucket: UsageBucket, rec: UsageRecord): UsageBucket {
  return {
    requests: bucket.requests + 1,
    inputTokens: bucket.inputTokens + rec.inputTokens,
    outputTokens: bucket.outputTokens + rec.outputTokens,
    estCostUsd: bucket.estCostUsd + rec.estCostUsd,
    failedRequests: bucket.failedRequests + (rec.success ? 0 : 1),
  };
}

export function aggregateUsage(records: UsageRecord[], activeModel = DEFAULT_MODEL, now = new Date()): UsageSummary {
  const nowDay = now.toISOString().slice(0, 10);
  const nowMonth = now.toISOString().slice(0, 7);

  let today = { ...EMPTY_BUCKET };
  let month = { ...EMPTY_BUCKET };
  const perModelMap = new Map<string, UsageBucket & { model: string }>();

  for (const rec of records) {
    const tsDay = rec.ts.slice(0, 10);
    const tsMonth = rec.ts.slice(0, 7);
    if (tsDay === nowDay) today = addTo(today, rec);
    if (tsMonth === nowMonth) month = addTo(month, rec);
    const existing = perModelMap.get(rec.model) ?? { ...EMPTY_BUCKET, model: rec.model };
    perModelMap.set(rec.model, addTo(existing, rec));
  }

  const activeEntry = findModel(activeModel);
  let freeTier: UsageSummary["freeTier"] = null;
  if (activeEntry?.freeTier) {
    const requestsToday = today.requests; // active model is what the student runs now; ledger counts all models' requests today
    freeTier = {
      model: activeEntry.id,
      requestsToday,
      rpd: activeEntry.freeTier.rpd,
      warning: requestsToday >= activeEntry.freeTier.rpd * 0.8,
    };
  }

  return { today, month, perModel: Array.from(perModelMap.values()), freeTier };
}

export function pruneUsage(baseDir?: string, now = new Date()): void {
  const filePath = usagePath(baseDir);
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 5 * 1024 * 1024) return;
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const kept = loadUsage(baseDir).filter((r) => r.ts >= cutoff);
    fs.writeFileSync(filePath, JSON.stringify(kept, null, 2), { mode: 0o600 });
  } catch {
    // No ledger yet — nothing to prune.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/usage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/config/usage.ts tests/usage.test.ts
git commit -m "feat(config): persistent usage ledger with cost and free-tier aggregation"
```

---

### Task 6: Document text extraction with hash cache

**Files:**
- Create: `server/documents/extract.ts`
- Test: `tests/extract.test.ts`

**Interfaces:**
- Consumes: `dataDir` from Task 4
- Produces (used by Task 8):
  - `interface ExtractedDoc { name: string; text: string; truncated: boolean }`
  - `interface RawUpload { name: string; type?: string; base64?: string; textContent?: string }`
  - `function extractDocuments(files: RawUpload[], baseDir?: string): Promise<ExtractedDoc[]>`
  - `const MAX_DOC_CHARS = 120_000`

- [ ] **Step 1: Write failing tests `tests/extract.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { extractDocuments, MAX_DOC_CHARS } from "../server/documents/extract";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "edublaxk-extract-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Minimal single-page PDF whose content stream draws the text "EDUBLAXK-SAMPLE".
const SAMPLE_PDF_BASE64 = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 62 >> stream
BT /F1 12 Tf 10 50 Td (EDUBLAXK-SAMPLE) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`,
  "utf-8"
).toString("base64");

describe("extractDocuments", () => {
  it("passes text files through unchanged", async () => {
    const result = await extractDocuments(
      [{ name: "notes.txt", type: "text/plain", textContent: "hello world" }],
      tmpDir
    );
    expect(result).toEqual([{ name: "notes.txt", text: "hello world", truncated: false }]);
  });

  it("extracts text from a PDF and caches it by content hash", async () => {
    const first = await extractDocuments(
      [{ name: "sample.pdf", type: "application/pdf", base64: SAMPLE_PDF_BASE64 }],
      tmpDir
    );
    expect(first[0].text.toUpperCase()).toContain("EDUBLAXK-SAMPLE");

    const cacheFiles = fs.readdirSync(path.join(tmpDir, "doc-cache"));
    expect(cacheFiles).toHaveLength(1);
    expect(cacheFiles[0]).toMatch(/^[a-f0-9]{64}\.txt$/);

    // Second extraction of the identical file must hit the cache (same output).
    const second = await extractDocuments(
      [{ name: "renamed.pdf", type: "application/pdf", base64: SAMPLE_PDF_BASE64 }],
      tmpDir
    );
    expect(second[0].text).toBe(first[0].text);
    expect(fs.readdirSync(path.join(tmpDir, "doc-cache"))).toHaveLength(1);
  });

  it("strips a data-URL prefix from base64 before hashing and decoding", async () => {
    const withPrefix = `data:application/pdf;base64,${SAMPLE_PDF_BASE64}`;
    const result = await extractDocuments(
      [{ name: "sample.pdf", type: "application/pdf", base64: withPrefix }],
      tmpDir
    );
    expect(result[0].text.toUpperCase()).toContain("EDUBLAXK-SAMPLE");
  });

  it("truncates documents over the character cap and flags them", async () => {
    const longText = "a".repeat(MAX_DOC_CHARS + 5000);
    const result = await extractDocuments(
      [{ name: "big.txt", type: "text/plain", textContent: longText }],
      tmpDir
    );
    expect(result[0].truncated).toBe(true);
    expect(result[0].text).toHaveLength(MAX_DOC_CHARS);
  });

  it("skips files with neither base64 PDF nor textContent", async () => {
    const result = await extractDocuments([{ name: "mystery.bin", type: "application/octet-stream" }], tmpDir);
    expect(result).toEqual([]);
  });
});
```

If the minimal PDF fixture fails to parse under `unpdf` (pdf.js is strict), replace the fixture with a fixture file generated once via another tool — but try the literal above first; pdf.js parses it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extract.test.ts`
Expected: FAIL — cannot resolve `../server/documents/extract`.

- [ ] **Step 3: Implement `server/documents/extract.ts`**

```typescript
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";
import { dataDir } from "../config/keys";

export const MAX_DOC_CHARS = 120_000;

export interface ExtractedDoc {
  name: string;
  text: string;
  truncated: boolean;
}

export interface RawUpload {
  name: string;
  type?: string;
  base64?: string;
  textContent?: string;
}

function cacheDir(baseDir?: string): string {
  return path.join(dataDir(baseDir), "doc-cache");
}

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
}

export function hashBytes(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function extractDocuments(files: RawUpload[], baseDir?: string): Promise<ExtractedDoc[]> {
  const dir = cacheDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });

  const results: ExtractedDoc[] = [];
  for (const file of files) {
    let text: string;

    if (file.base64 && file.type?.includes("pdf")) {
      const bytes = decodeBase64(file.base64);
      const cacheFile = path.join(dir, `${hashBytes(bytes)}.txt`);
      if (fs.existsSync(cacheFile)) {
        text = fs.readFileSync(cacheFile, "utf-8");
      } else {
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text: parsed } = await extractText(pdf, { mergePages: true });
        text = parsed;
        fs.writeFileSync(cacheFile, text, { mode: 0o600 });
      }
    } else if (file.textContent) {
      text = file.textContent;
    } else {
      continue; // Unusable upload — skip rather than send garbage to the model.
    }

    const truncated = text.length > MAX_DOC_CHARS;
    results.push({
      name: file.name,
      text: truncated ? text.slice(0, MAX_DOC_CHARS) : text,
      truncated,
    });
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extract.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/documents/extract.ts tests/extract.test.ts
git commit -m "feat(documents): server-side PDF text extraction with sha256 cache"
```

---

### Task 7: AI router with classified retry policy

**Files:**
- Create: `server/ai/router.ts`
- Test: `tests/router.test.ts`

**Interfaces:**
- Consumes: `findModel`, `ProviderId` from Task 2; `recordUsage` from Task 5; `getApiKey`, `loadKeys` from Task 4
- Produces (used by Task 8):
  - `type ErrorKind = "auth" | "rate_limit" | "overloaded" | "parse" | "other"`
  - `class AiRouterError extends Error { kind: ErrorKind; modelUsed?: string; retryAfterMinutes?: number }`
  - `function classifyError(err: unknown): ErrorKind`
  - `function executeWithPolicy<T>(selection: string, attempt: (modelId: string) => Promise<{ result: T; usage: { inputTokens: number; outputTokens: number } }>): Promise<{ result: T; modelUsed: string; usage: { inputTokens: number; outputTokens: number } }>`
  - `function structuredCall<S extends z.ZodType>(args: { endpoint: string; selection?: string; schema: S; system?: string; prompt: string }): Promise<z.infer<S>>`
  - `function textCall(args: { endpoint: string; selection?: string; system?: string; prompt?: string; messages?: Array<{ role: "user" | "assistant"; content: string }> }): Promise<string>`
  - `function validateProviderKey(provider: ProviderId, apiKey: string): Promise<void>`

- [ ] **Step 1: Write failing tests `tests/router.test.ts`**

The retry policy is tested through `executeWithPolicy` with fake `attempt` functions — no network, no SDK.

```typescript
import { describe, it, expect, vi } from "vitest";
import { classifyError, executeWithPolicy, AiRouterError } from "../server/ai/router";
import { APICallError } from "ai";

function apiError(statusCode: number, message = `HTTP ${statusCode}`) {
  return new APICallError({ url: "https://api.test", requestBodyValues: {}, statusCode, responseBody: message, message });
}

describe("classifyError", () => {
  it("classifies 401/403 as auth", () => {
    expect(classifyError(apiError(401))).toBe("auth");
    expect(classifyError(apiError(403))).toBe("auth");
  });
  it("classifies 429 as rate_limit", () => {
    expect(classifyError(apiError(429))).toBe("rate_limit");
  });
  it("classifies 503 and 500 as overloaded", () => {
    expect(classifyError(apiError(503))).toBe("overloaded");
    expect(classifyError(apiError(500))).toBe("overloaded");
  });
  it("falls back to message sniffing for non-APICallError errors", () => {
    expect(classifyError(new Error("API key not valid. Please pass a valid API key."))).toBe("auth");
    expect(classifyError(new Error("Resource has been exhausted (e.g. check quota)."))).toBe("rate_limit");
    expect(classifyError(new Error("The model is overloaded. Please try again later."))).toBe("overloaded");
    expect(classifyError(new Error("Something unexpected"))).toBe("other");
  });
});

describe("executeWithPolicy", () => {
  const ok = (v: string) => async () => ({ result: v, usage: { inputTokens: 10, outputTokens: 5 } });

  it("returns the first successful attempt on the preferred model", async () => {
    const attempt = vi.fn(ok("quiz"));
    const out = await executeWithPolicy("google:gemini-2.5-flash", attempt);
    expect(out.result).toBe("quiz");
    expect(out.modelUsed).toBe("google:gemini-2.5-flash");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("fails fast on auth errors without retry or fallback", async () => {
    const attempt = vi.fn().mockRejectedValue(apiError(401));
    await expect(executeWithPolicy("google:gemini-2.5-flash", attempt)).rejects.toMatchObject({ kind: "auth" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model in the chain after an overload retry", async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503)) // retry on same model also overloaded
      .mockImplementationOnce(ok("from-fallback") as any);
    const out = await executeWithPolicy("google:gemini-2.5-flash", attempt);
    expect(out.modelUsed).toBe("google:gemini-2.5-flash-lite");
    expect(out.result).toBe("from-fallback");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("retries a rate-limited model at most twice, then throws with retryAfterMinutes", async () => {
    const attempt = vi.fn().mockRejectedValue(apiError(429));
    await expect(
      executeWithPolicy("google:gemini-2.5-flash", attempt)
    ).rejects.toMatchObject({ kind: "rate_limit", retryAfterMinutes: 6 }); // ceil(60 / 10 rpm)
    // 1 initial + 2 retries = 3 calls, all on the preferred model
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("throws a clean error for an unknown model id", async () => {
    await expect(executeWithPolicy("google:gemini-3.7-flash", vi.fn())).rejects.toBeInstanceOf(AiRouterError);
  });

  it("fails fast on other errors", async () => {
    const attempt = vi.fn().mockRejectedValue(apiError(400, "Invalid request"));
    await expect(executeWithPolicy("google:gemini-2.5-flash", attempt)).rejects.toMatchObject({ kind: "other" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
```

Note: `APICallError` constructor shape above matches AI SDK v5 (`new APICallError({ url, requestBodyValues, statusCode, responseBody, message })`). If the installed version's constructor differs, adapt the `apiError` helper to whatever `new APICallError(...)` accepts — check `node_modules/ai/dist/index.d.ts`. Do **not** weaken the test to avoid constructing it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router.test.ts`
Expected: FAIL — cannot resolve `../server/ai/router`.

- [ ] **Step 3: Implement `server/ai/router.ts`**

```typescript
import { APICallError, generateObject, generateText, TypeValidationError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";
import { findModel, ProviderId } from "./catalog";
import { getApiKey, loadKeys } from "../config/keys";
import { recordUsage } from "../config/usage";

export type ErrorKind = "auth" | "rate_limit" | "overloaded" | "parse" | "other";

export class AiRouterError extends Error {
  constructor(
    message: string,
    public kind: ErrorKind,
    public modelUsed?: string,
    public retryAfterMinutes?: number
  ) {
    super(message);
    this.name = "AiRouterError";
  }
}

export function classifyError(err: unknown): ErrorKind {
  if (err instanceof APICallError) {
    if (err.statusCode === 401 || err.statusCode === 403) return "auth";
    if (err.statusCode === 429) return "rate_limit";
    if (err.statusCode === 500 || err.statusCode === 503) return "overloaded";
  }
  if (err instanceof TypeValidationError) return "parse";
  const msg = String((err as any)?.message ?? err).toLowerCase();
  if (msg.includes("api key") || msg.includes("unauthorized") || msg.includes("permission_denied")) return "auth";
  if (msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota")) return "rate_limit";
  if (msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded")) return "overloaded";
  if (msg.includes("type validation failed")) return "parse";
  return "other";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number) => ms * (0.75 + Math.random() * 0.5);

export interface CallOutcome<T> {
  result: T;
  modelUsed: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MAX_RATE_LIMIT_RETRIES = 2;

/**
 * Runs `attempt` against the selected model with the spec's retry policy:
 * - auth / other: fail fast
 * - rate_limit: up to 2 backoff retries on the same model, then throw with retryAfterMinutes
 * - overloaded: 1 retry on the same model, then the next model in the catalog fallback chain
 * - parse: 1 retry on the same model, then throw
 */
export async function executeWithPolicy<T>(
  selection: string,
  attempt: (modelId: string) => Promise<{ result: T; usage: { inputTokens: number; outputTokens: number } }>
): Promise<CallOutcome<T>> {
  const entry = findModel(selection);
  if (!entry) {
    throw new AiRouterError(`Unknown model "${selection}". Pick a model from Settings.`, "other", selection);
  }

  const chain = [entry.id, ...entry.fallbacks];
  let lastError: unknown;

  for (const modelId of chain) {
    const modelEntry = findModel(modelId)!;

    let rateLimitRetries = 0;
    let overloadedRetries = 0;
    let parseRetries = 0;

    // Inner loop: per-model retries (rate limit / overload / parse)
    for (;;) {
      try {
        const { result, usage } = await attempt(modelId);
        return { result, modelUsed: modelId, usage };
      } catch (err) {
        lastError = err;
        const kind = classifyError(err);

        if (kind === "rate_limit" && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          rateLimitRetries++;
          await sleep(jitter(1000 * rateLimitRetries)); // 1s, 2s with jitter
          continue;
        }
        if (kind === "rate_limit") {
          const rpm = modelEntry.freeTier?.rpm ?? 15;
          throw new AiRouterError(
            `Free-tier rate limit hit on ${modelEntry.label}. Wait ~${Math.ceil(60 / rpm)} minutes or switch to another model in Settings.`,
            "rate_limit",
            modelId,
            Math.ceil(60 / rpm)
          );
        }
        if (kind === "overloaded" && overloadedRetries < 1) {
          overloadedRetries++;
          await sleep(jitter(750));
          continue;
        }
        if (kind === "parse" && parseRetries < 1) {
          parseRetries++;
          continue; // repair retry: same call, the model usually self-corrects
        }
        if (kind === "auth") {
          throw new AiRouterError(
            `Your ${modelEntry.provider} API key is invalid or unauthorized. Update it in Settings.`,
            "auth",
            modelId
          );
        }
        if (kind === "overloaded" || kind === "parse") {
          break; // move to the next model in the fallback chain
        }
        throw new AiRouterError(
          (err as any)?.message ?? "AI request failed.",
          "other",
          modelId
        );
      }
    }
  }

  throw new AiRouterError(
    `All models for this provider are temporarily overloaded. Please try again in a few moments.`,
    "overloaded",
    selection,
  );
}

function buildLanguageModel(modelId: string, apiKey: string) {
  const [provider, model] = modelId.split(":");
  switch (provider as ProviderId) {
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    default:
      throw new AiRouterError(`Unknown provider "${provider}".`, "other", modelId);
  }
}

function requireApiKey(provider: ProviderId): string {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new AiRouterError(
      `No API key configured for ${provider}. Add one in Settings.`,
      "auth"
    );
  }
  return apiKey;
}

function resolveSelection(selection?: string): string {
  return selection?.trim() || loadKeys().activeModel;
}

function recordOutcome(endpoint: string, modelUsed: string, usage: { inputTokens: number; outputTokens: number }) {
  recordUsage({
    ts: new Date().toISOString(),
    model: modelUsed,
    endpoint,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    success: true,
  });
}

function recordFailure(endpoint: string, modelUsed: string) {
  recordUsage({
    ts: new Date().toISOString(),
    model: modelUsed,
    endpoint,
    inputTokens: 0,
    outputTokens: 0,
    success: false,
  });
}

export async function structuredCall<S extends z.ZodType>(args: {
  endpoint: string;
  selection?: string;
  schema: S;
  system?: string;
  prompt: string;
}): Promise<z.infer<S>> {
  const selection = resolveSelection(args.selection);
  try {
    const outcome = await executeWithPolicy(selection, async (modelId) => {
      const provider = modelId.split(":")[0] as ProviderId;
      const apiKey = requireApiKey(provider);
      const res = await generateObject({
        model: buildLanguageModel(modelId, apiKey),
        schema: args.schema,
        system: args.system,
        prompt: args.prompt,
      });
      return {
        result: res.object as z.infer<S>,
        usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 },
      };
    });
    recordOutcome(args.endpoint, outcome.modelUsed, outcome.usage);
    return outcome.result;
  } catch (err) {
    const modelUsed = err instanceof AiRouterError ? err.modelUsed : selection;
    recordFailure(args.endpoint, modelUsed);
    throw err;
  }
}

export async function textCall(args: {
  endpoint: string;
  selection?: string;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const selection = resolveSelection(args.selection);
  try {
    const outcome = await executeWithPolicy(selection, async (modelId) => {
      const provider = modelId.split(":")[0] as ProviderId;
      const apiKey = requireApiKey(provider);
      const res = await generateText({
        model: buildLanguageModel(modelId, apiKey),
        system: args.system,
        prompt: args.prompt,
        messages: args.messages,
        maxTokens: 2048,
      });
      return {
        result: res.text,
        usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 },
      };
    });
    recordOutcome(args.endpoint, outcome.modelUsed, outcome.usage);
    return outcome.result;
  } catch (err) {
    const modelUsed = err instanceof AiRouterError ? err.modelUsed : selection;
    recordFailure(args.endpoint, modelUsed);
    throw err;
  }
}

export async function validateProviderKey(provider: ProviderId, apiKey: string): Promise<void> {
  const entry =
    ({ google: "google:gemini-2.5-flash", anthropic: "anthropic:claude-haiku-4-5", openai: "openai:gpt-5-mini" } as const)[
      provider
    ];
  await executeWithPolicy(entry, async (modelId) => {
    const res = await generateText({
      model: buildLanguageModel(modelId, apiKey),
      prompt: "Reply with the single word: VALID",
      maxTokens: 8,
    });
    return { result: res.text, usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 } };
  });
}
```

Note: `generateText`'s output-token parameter is `maxTokens` in AI SDK v5 (it was `maxOutputTokens` in some versions) — check `node_modules/ai/dist/index.d.ts` and use whatever the installed version names it. The overload-retry loop intentionally re-runs the identical call for `parse` — the model almost always produces valid JSON on the second attempt; if the installed SDK exposes `experimental_repairText`, you may pass a simple re-prompt repair instead, but the retry loop is the contract the tests check.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/router.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/ai/router.ts tests/router.test.ts
git commit -m "feat(ai): provider router with classified retry policy and usage recording"
```

---

### Task 8: Rewrite server routes

**Files:**
- Rewrite: `server.ts` (full replacement)
- Create: `tests/routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces (used by Tasks 9–12): the HTTP API:
  - `GET /api/health` → `{ status, activeModel, providers: Record<ProviderId, boolean>, timestamp }`
  - `GET /api/models` → `{ models: Array<{ id, provider, providerLabel, label, tier, pricing, freeTier, hasKey }> }`
  - `GET /api/config` → `{ activeModel, providers: Record<ProviderId, boolean> }`
  - `POST /api/keys` `{ provider, apiKey, model? }` → `{ success, message, activeModel }`
  - `DELETE /api/keys/:provider` → `{ success, activeModel }`
  - `POST /api/config/model` `{ model }` → `{ success, activeModel }`
  - `GET /api/usage` → `{ summary: UsageSummary }`
  - `POST /api/generate-quiz` → quiz object **without** `documents`/`dataUrl`, with `warnings: string[]`
  - `POST /api/evaluate-theory` → evaluation object
  - `POST /api/ask-tutor` → `{ reply, modelUsed }`
  - Exported `app` (Express instance) for tests

- [ ] **Step 1: Write failing tests `tests/routes.test.ts`**

Route tests mock `server/ai/router` (the AI SDK boundary) and use a temp data dir via `EDUBLAXK_DATA_DIR`.

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";

vi.mock("../server/ai/router", () => ({
  structuredCall: vi.fn(),
  textCall: vi.fn(),
  validateProviderKey: vi.fn(),
  AiRouterError: class AiRouterError extends Error {
    kind: string;
    modelUsed?: string;
    retryAfterMinutes?: number;
    constructor(message: string, kind: string, modelUsed?: string) {
      super(message);
      this.kind = kind;
      this.modelUsed = modelUsed;
    }
  },
}));

import { structuredCall, textCall, validateProviderKey } from "../server/ai/router";
// Import app AFTER the mock is registered
import { app } from "../server";

let server: Server;
let baseUrl: string;
let tmpDir: string;
const prevDataDir = process.env.EDUBLAXK_DATA_DIR;

beforeAll(async () => {
  server = app.listen(0);
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
  if (prevDataDir === undefined) delete process.env.EDUBLAXK_DATA_DIR;
  else process.env.EDUBLAXK_DATA_DIR = prevDataDir;
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "edublaxk-routes-"));
  process.env.EDUBLAXK_DATA_DIR = tmpDir;
  vi.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("GET /api/health", () => {
  it("reports the active model and provider key presence", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.activeModel).toBe("google:gemini-2.5-flash");
    expect(data.providers).toEqual({ google: false, anthropic: false, openai: false });
  });
});

describe("GET /api/models", () => {
  it("lists catalog models with provider key status", async () => {
    const res = await fetch(`${baseUrl}/api/models`);
    const data = await res.json();
    expect(data.models.length).toBeGreaterThanOrEqual(5);
    expect(data.models[0]).toMatchObject({ id: "google:gemini-2.5-flash", provider: "google", hasKey: false });
  });
});

describe("POST /api/keys", () => {
  it("validates and saves a provider key, reporting the active model", async () => {
    (validateProviderKey as any).mockResolvedValue(undefined);
    const res = await fetch(`${baseUrl}/api/keys`, json({ provider: "google", apiKey: "AIzaSy-x" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.activeModel).toBe("google:gemini-2.5-flash");

    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    expect(health.providers.google).toBe(true);
  });

  it("rejects an invalid key with a 400 and does not save it", async () => {
    (validateProviderKey as any).mockRejectedValue(
      Object.assign(new Error("Your google API key is invalid."), { kind: "auth" })
    );
    const res = await fetch(`${baseUrl}/api/keys`, json({ provider: "google", apiKey: "bad" }));
    expect(res.status).toBe(400);
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    expect(health.providers.google).toBe(false);
  });

  it("rejects an unknown provider", async () => {
    const res = await fetch(`${baseUrl}/api/keys`, json({ provider: "midjourney", apiKey: "x" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate-quiz", () => {
  it("extracts document text, calls structuredCall, and returns a quiz without document payloads", async () => {
    (structuredCall as any).mockResolvedValue({
      title: "Test Quiz",
      summary: "Summary",
      topicsCovered: ["Topic A"],
      questions: [
        {
          id: "q-1",
          type: "mcq",
          question: "2+2?",
          options: ["3", "4", "5", "6"],
          correctAnswerIndex: 1,
          explanation: "Arithmetic.",
          sourceContext: "Chapter 1",
          modelAnswer: "",
          theoryRubric: [],
          topic: "Topic A",
          difficulty: "easy",
        },
      ],
    });

    const res = await fetch(`${baseUrl}/api/generate-quiz`, {
      ...json({
        files: [{ name: "notes.txt", type: "text/plain", textContent: "Study notes content" }],
        mcqCount: 5,
        theoryCount: 0,
        difficulty: "Beginner",
      }),
    });
    const quiz = await res.json();

    expect(res.status).toBe(200);
    expect(quiz.title).toBe("Test Quiz");
    expect(quiz.documentNames).toEqual(["notes.txt"]);
    expect(quiz.documents).toBeUndefined();
    expect(quiz.warnings).toEqual([]);

    const callArgs = (structuredCall as any).mock.calls[0][0];
    expect(callArgs.endpoint).toBe("generate-quiz");
    expect(callArgs.prompt).toContain("Study notes content");
    expect(callArgs.prompt).toContain("EXACTLY 5 questions");
  });

  it("surfaces a truncation warning for oversized documents", async () => {
    (structuredCall as any).mockResolvedValue({
      title: "T", summary: "S", topicsCovered: [], questions: [],
    });
    const res = await fetch(`${baseUrl}/api/generate-quiz`, {
      ...json({ files: [{ name: "big.txt", type: "text/plain", textContent: "x".repeat(130_000) }], mcqCount: 5 }),
    });
    const quiz = await res.json();
    expect(quiz.warnings.length).toBe(1);
    expect(quiz.warnings[0]).toContain("big.txt");
  });

  it("rejects a request with no files", async () => {
    const res = await fetch(`${baseUrl}/api/generate-quiz`, json({ files: [] }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ask-tutor", () => {
  it("maps chat history and returns the tutor reply", async () => {
    (textCall as any).mockResolvedValue("Mitochondria make ATP.");
    const res = await fetch(`${baseUrl}/api/ask-tutor`, {
      ...json({
        questionContext: { question: "Which organelle makes ATP?", explanation: "Mitochondria" },
        chatHistory: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
        userMessage: "explain",
      }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBe("Mitochondria make ATP.");
    const callArgs = (textCall as any).mock.calls[0][0];
    expect(callArgs.endpoint).toBe("ask-tutor");
    expect(callArgs.messages[0]).toEqual({ role: "user", content: "hi" });
    expect(callArgs.messages[1]).toEqual({ role: "assistant", content: "hello" });
  });
});

describe("GET /api/usage", () => {
  it("returns an aggregated summary", async () => {
    const res = await fetch(`${baseUrl}/api/usage`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.summary.today).toBeDefined();
    expect(data.summary.perModel).toEqual([]);
  });
});
```

Note the test for oversized documents writes 130k chars — under the 20MB body limit, so no 413.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/routes.test.ts`
Expected: FAIL — `../server` does not export `app` (current `server.ts` starts listening and has no export).

- [ ] **Step 3: Rewrite `server.ts`**

Replace the entire file. The quiz prompt keeps the existing prompt text from the old `server.ts` (the "EduBLAXK elite tutor" instructions and anti-duplication block) — reproduced below.

```typescript
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { DEFAULT_MODEL, MODEL_CATALOG, PROVIDER_LABELS, ProviderId } from "./server/ai/catalog";
import { AiRouterError, structuredCall, textCall, validateProviderKey } from "./server/ai/router";
import { quizSchema, evaluationSchema } from "./server/ai/schemas";
import { loadKeys, removeProviderKey, setActiveModel, setProviderKey } from "./server/config/keys";
import { aggregateUsage, loadUsage, pruneUsage } from "./server/config/usage";
import { extractDocuments } from "./server/documents/extract";

dotenv.config();

export const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// 20MB body limit (spec: kills the old 100MB base64 firehose)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const PROVIDERS: ProviderId[] = ["google", "anthropic", "openai"];

function providerKeyStatus(): Record<ProviderId, boolean> {
  const keys = loadKeys();
  return {
    google: Boolean(keys.providers.google),
    anthropic: Boolean(keys.providers.anthropic),
    openai: Boolean(keys.providers.openai),
  };
}

function modelFromHeader(req: express.Request): string | undefined {
  const raw = req.headers["x-model"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function aiErrorResponse(res: express.Response, err: unknown) {
  if (err instanceof AiRouterError) {
    const status = err.kind === "auth" ? 400 : err.kind === "rate_limit" ? 429 : err.kind === "overloaded" ? 503 : 500;
    res.status(status).json({ error: err.message, kind: err.kind, retryAfterMinutes: err.retryAfterMinutes });
    return;
  }
  console.error("[EduBLAXK] AI error:", err);
  res.status(500).json({ error: (err as any)?.message || "AI request failed." });
}

// API: Health check
app.get("/api/health", (_req, res) => {
  const keys = loadKeys();
  res.json({
    status: "ok",
    activeModel: keys.activeModel,
    providers: providerKeyStatus(),
    timestamp: new Date().toISOString(),
  });
});

// API: Model catalog (public info only — no keys)
app.get("/api/models", (_req, res) => {
  const keyStatus = providerKeyStatus();
  res.json({
    models: MODEL_CATALOG.map((m) => ({
      id: m.id,
      provider: m.provider,
      providerLabel: PROVIDER_LABELS[m.provider],
      label: m.label,
      tier: m.tier,
      pricing: m.pricing,
      freeTier: m.freeTier,
      hasKey: keyStatus[m.provider],
    })),
  });
});

// API: Client config (which providers are usable — never the keys)
app.get("/api/config", (_req, res) => {
  const keys = loadKeys();
  res.json({ activeModel: keys.activeModel, providers: providerKeyStatus() });
});

// API: Save (and validate) a provider key
app.post("/api/keys", async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body ?? {};
    if (!PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Unknown provider "${provider}".` });
      return;
    }
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      res.status(400).json({ error: "Please provide an API key." });
      return;
    }
    await validateProviderKey(provider, apiKey.trim());
    setProviderKey(provider, apiKey.trim());
    if (model) setActiveModel(model);
    const keys = loadKeys();
    res.json({ success: true, message: `${PROVIDER_LABELS[provider]} key saved and validated.`, activeModel: keys.activeModel });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Remove a provider key
app.delete("/api/keys/:provider", (req, res) => {
  const provider = req.params.provider as ProviderId;
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: `Unknown provider "${provider}".` });
    return;
  }
  removeProviderKey(provider);
  // If the active model belonged to the removed provider, fall back to the default.
  const keys = loadKeys();
  if (keys.activeModel.startsWith(`${provider}:`) || !keys.providers[keys.activeModel.split(":")[0] as ProviderId]) {
    if (!keys.providers[keys.activeModel.split(":")[0] as ProviderId]) {
      setActiveModel(DEFAULT_MODEL);
    }
  }
  res.json({ success: true, activeModel: loadKeys().activeModel });
});

// API: Set the default model
app.post("/api/config/model", (req, res) => {
  const { model } = req.body ?? {};
  if (!MODEL_CATALOG.some((m) => m.id === model)) {
    res.status(400).json({ error: `Unknown model "${model}".` });
    return;
  }
  setActiveModel(model);
  res.json({ success: true, activeModel: loadKeys().activeModel });
});

// API: Usage summary
app.get("/api/usage", (_req, res) => {
  const keys = loadKeys();
  res.json({ summary: aggregateUsage(loadUsage(), keys.activeModel) });
});

// API: Generate Quiz from Document(s)
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { files, mcqCount = 10, theoryCount = 3, difficulty = "Intermediate", studyFocus = "", excludedQuestions = [] } =
      req.body ?? {};

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "Please upload at least one educational document/PDF." });
      return;
    }

    const docs = await extractDocuments(files);
    if (docs.length === 0) {
      res.status(400).json({ error: "No readable text found in the uploaded files. PDFs must contain selectable text." });
      return;
    }

    const warnings = docs.filter((d) => d.truncated).map((d) => `"${d.name}" was truncated to fit the model context.`);

    const deduplicationInstructions =
      Array.isArray(excludedQuestions) && excludedQuestions.length > 0
        ? `
=========================================
CRITICAL ANTI-DUPLICATION MANDATE:
The student has already practiced questions from this document and wants MORE FRESH QUESTIONS.
DO NOT repeat, rephrase, or re-test any of the following ${excludedQuestions.length} previously generated questions:
${excludedQuestions
  .slice(0, 75)
  .map((q: string, idx: number) => `${idx + 1}. "${q.trim()}"`)
  .join("\n")}

REQUIREMENT: Every single new question MUST be completely novel, exploring alternative topics, different formulas, deeper reasoning, complementary sections, other figures, or untested concepts from the document(s).
=========================================
`
        : "";

    const documentText = docs
      .map((d) => `[DOCUMENT: ${d.name}]\n${d.text}`)
      .join("\n\n");

    const promptInstructions = `${documentText}

You are EduBLAXK, an elite Local AI Tutor and educational assessment specialist.
Analyze the attached educational document(s) thoroughly and create a high-rigor, high-quality assessment quiz based STRICTLY on the facts, theories, methodologies, concepts, and details contained within the documents.

Target Specifications:
- Multiple Choice Questions (MCQ): EXACTLY ${mcqCount} questions.
  - Each MCQ must have 4 distinct, plausible options.
  - Exactly one correct answer with index (0, 1, 2, or 3).
  - Clear explanation of why the correct option is right and why distractors are wrong.
  - Include an exact quote or context reference from the document (sourceContext).
- Theory / Open-Ended Questions: EXACTLY ${theoryCount} questions.
  - Thought-provoking conceptual or problem-solving questions testing deep understanding.
  - Provide an exemplary model answer.
  - Provide a clear scoring rubric with 3 to 5 key points/criteria expected from a complete student response.
  - Include source context from the document.
- Target Academic Level: ${difficulty}.
${studyFocus ? `- Specific Study Focus Requested: "${studyFocus}"` : ""}
${deduplicationInstructions}

Generate questions that test both foundational knowledge and applied analytical reasoning. Avoid trivial, superficial, or ambiguous questions.
`;

    const quizData = await structuredCall({
      endpoint: "generate-quiz",
      selection: modelFromHeader(req),
      schema: quizSchema,
      system:
        "You are EduBLAXK, an expert local educational tutor. You extract accurate quizzes and theory questions from user documents. Output strictly valid JSON matching the requested schema.",
      prompt: promptInstructions,
    });

    const normalizedQuestions = (quizData.questions || []).map((q, idx) => ({
      id: q.id || `q-${idx + 1}-${Date.now()}`,
      type: q.type === "theory" ? "theory" : "mcq",
      question: q.question || `Question ${idx + 1}`,
      options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : q.type === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : [],
      correctAnswerIndex: typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0,
      explanation: q.explanation || "No explanation provided.",
      sourceContext: q.sourceContext || "Extracted from uploaded materials.",
      modelAnswer: q.modelAnswer || (q.type === "theory" ? "Comprehensive conceptual response based on document." : ""),
      theoryRubric:
        Array.isArray(q.theoryRubric) && q.theoryRubric.length > 0
          ? q.theoryRubric
          : ["Identifies core underlying concept correctly", "Provides logical explanation supported by facts", "Uses accurate subject terminology"],
      topic: q.topic || "Core Subject",
      difficulty: q.difficulty || "medium",
    }));

    res.json({
      id: `quiz-${Date.now()}`,
      title: quizData.title || "EduBLAXK Educational Assessment",
      summary: quizData.summary || "Comprehensive assessment generated from your study documents.",
      createdAt: new Date().toISOString(),
      documentNames: docs.map((d) => d.name),
      totalQuestions: normalizedQuestions.length,
      mcqCount: normalizedQuestions.filter((q) => q.type === "mcq").length,
      theoryCount: normalizedQuestions.filter((q) => q.type === "theory").length,
      difficulty,
      topicsCovered: quizData.topicsCovered || ["General Concepts"],
      questions: normalizedQuestions,
      warnings,
    });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Evaluate Student Theory Answer
app.post("/api/evaluate-theory", async (req, res) => {
  try {
    const { question, userAnswer, modelAnswer, rubric = [], maxScore = 5 } = req.body ?? {};
    if (!question || !userAnswer) {
      res.status(400).json({ error: "Question and user answer are required for evaluation." });
      return;
    }

    const evaluationPrompt = `You are EduBLAXK, an encouraging but academically rigorous tutor grading a student's theory response.
Evaluate the student's answer against the question, model answer, and rubric criteria.

Question: "${question}"
Student's Answer: "${userAnswer}"
Exemplary Model Answer: "${modelAnswer}"
Grading Rubric Criteria:
${rubric.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

Max Score: ${maxScore} points.

Evaluate fairly:
- Award partial credit where valid understanding is demonstrated.
- Be objective and specific in your feedback.
- Identify which key rubric points were addressed and which were missed.
- Give 2 actionable improvement tips for revision.
`;

    const evaluation = await structuredCall({
      endpoint: "evaluate-theory",
      selection: modelFromHeader(req),
      schema: evaluationSchema,
      prompt: evaluationPrompt,
    });

    res.json({
      ...evaluation,
      score: Math.max(0, Math.min(evaluation.score, maxScore)),
      maxScore,
      percentage: Math.max(0, Math.min(evaluation.percentage, 100)),
    });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Ask AI Tutor
app.post("/api/ask-tutor", async (req, res) => {
  try {
    const { questionContext, chatHistory = [], userMessage } = req.body ?? {};
    if (!userMessage) {
      res.status(400).json({ error: "A message is required." });
      return;
    }

    const historyMessages = (chatHistory as Array<{ role: string; content: string }>).map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const systemInstruction = `You are the EduBLAXK Local AI Tutor ("I Love OPEN SOURCE ~ Blaxk").
You are tutoring a student on an assessment question.
Question Context:
- Question: "${questionContext?.question || "Assessment item"}"
- Correct Concept/Explanation: "${questionContext?.explanation || "Educational standard"}"
- Document Reference: "${questionContext?.sourceContext || "Source text"}"

Guidelines:
- Explain concepts with clarity, intuition, and real-world analogies.
- Be concise, direct, supportive, and pedagogical.
- If the student is confused about why an option is right or wrong, break it down step-by-step.
- Avoid rambling; keep responses focused on active learning.
`;

    const reply = await textCall({
      endpoint: "ask-tutor",
      selection: modelFromHeader(req),
      system: systemInstruction,
      messages: [...historyMessages, { role: "user", content: userMessage }],
    });

    res.json({ reply: reply || "I'm here to help clarify any part of this concept!" });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// Vite Middleware for Dev and Static Serving for Production
async function startServer() {
  pruneUsage();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EduBLAXK Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Do not listen when running under vitest (route tests import `app` directly).
if (!process.env.VITEST) {
  startServer();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/routes.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run lint`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server.ts tests/routes.test.ts
git commit -m "feat(server): multi-provider routes with 20MB cap and usage endpoint"
```

---

### Task 9: Frontend API client, types, and storage migration

**Files:**
- Modify: `src/types.ts` (lines 84–105)
- Modify: `src/lib/storage.ts` (lines 18–44)
- Rewrite: `src/lib/api.ts`

**Interfaces:**
- Consumes: Task 8's HTTP API
- Produces (used by Tasks 10–13):
  - `types.ts`: `UserPreferences` without `apiKey`, `preferredModel?: string` holding the full `"provider:model"` id; new types `ModelInfo { id; provider; providerLabel; label; tier; pricing: { input: number; output: number }; freeTier: { rpm: number; rpd: number } | null; hasKey: boolean }`, `ServerConfig { activeModel: string; providers: Record<string, boolean> }`, `UsageSummaryResponse` mirroring the server's `UsageSummary`
  - `api.ts`: `getModels()`, `getServerConfig()`, `saveProviderKey(provider, apiKey, model?)`, `removeProviderKey(provider)`, `setActiveModel(model)`, `getUsageSummary()`, plus the existing `checkBackendHealth`, `generateQuizFromDocuments`, `evaluateTheoryAnswer`, `askAiTutor` (unchanged signatures)

No React test infrastructure exists in this project, so the test cycle for frontend tasks is `npm run lint` (tsc) plus a manual dev-server check listed at the end.

- [ ] **Step 1: Update `src/types.ts`**

Replace the `UserPreferences` interface (lines 86–96) with:

```typescript
export interface UserPreferences {
  hasCompletedWizard: boolean;
  defaultMcqCount: number;
  defaultTheoryCount: number;
  defaultDifficulty: string;
  autoSaveToVault: boolean;
  timerMinutesPerQuestion: number;
  preferredModel?: string; // full "provider:model" id, e.g. "google:gemini-2.5-flash"
  theme: AppTheme;
}
```

Add after `UploadedFileSummary`:

```typescript
export interface ModelInfo {
  id: string;
  provider: string;
  providerLabel: string;
  label: string;
  tier: "fast" | "balanced" | "premium";
  pricing: { input: number; output: number };
  freeTier: { rpm: number; rpd: number } | null;
  hasKey: boolean;
}

export interface ServerConfig {
  activeModel: string;
  providers: Record<string, boolean>;
}

export interface UsageBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  failedRequests: number;
}

export interface UsageSummary {
  today: UsageBucket;
  month: UsageBucket;
  perModel: Array<UsageBucket & { model: string }>;
  freeTier: { model: string; requestsToday: number; rpd: number; warning: boolean } | null;
}

export interface UsageSummaryResponse {
  summary: UsageSummary;
}
```

Also make the quiz's stored-document field explicitly optional for backward compatibility — add to `Quiz` (after `modelUsed?: string;`):

```typescript
  /** Legacy field from before the API rework — old saved quizzes may still carry it. */
  documents?: Array<{ name: string; type?: string; size?: number; textContent?: string; dataUrl?: string }>;
  /** Server-side warnings (e.g. document truncation) surfaced after generation. */
  warnings?: string[];
```

- [ ] **Step 2: Update `src/lib/storage.ts`**

Replace `DEFAULT_PREFERENCES` (lines 18–27) and add a legacy migration in `getStoredPreferences`:

```typescript
export const DEFAULT_PREFERENCES: UserPreferences = {
  hasCompletedWizard: false,
  defaultMcqCount: 10,
  defaultTheoryCount: 3,
  defaultDifficulty: "Intermediate",
  autoSaveToVault: true,
  timerMinutesPerQuestion: 1.5,
  theme: "red-light",
};

// Mirrors server/ai/catalog.ts LEGACY_MODEL_MAP — old prefs stored bare Gemini names.
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "google:gemini-2.5-flash",
  "gemini-2.5-flash-lite": "google:gemini-2.5-flash-lite",
  "gemini-2.5-pro": "google:gemini-2.5-flash",
  "gemini-2.0-flash": "google:gemini-2.5-flash",
};

function migratePreferences(parsed: Partial<UserPreferences> & { apiKey?: string }): Partial<UserPreferences> {
  // API keys moved to the server in the API rework — never store them in the browser again.
  delete parsed.apiKey;
  if (typeof parsed.preferredModel === "string" && !parsed.preferredModel.includes(":")) {
    const mapped = LEGACY_MODEL_MAP[parsed.preferredModel];
    if (mapped) parsed.preferredModel = mapped;
    else delete parsed.preferredModel;
  }
  return parsed;
}
```

Then in `getStoredPreferences`, after `const parsed = JSON.parse(raw);` and before the theme normalization, insert:

```typescript
    migratePreferences(parsed);
```

- [ ] **Step 3: Rewrite `src/lib/api.ts`**

```typescript
import { Quiz, TheoryEvaluation, TutorChatMessage, UploadedFileSummary, ModelInfo, ServerConfig, UsageSummaryResponse } from "../types";
import { getStoredPreferences } from "./storage";

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const prefs = getStoredPreferences();
  if (prefs.preferredModel && prefs.preferredModel.trim()) {
    headers["x-model"] = prefs.preferredModel.trim();
  }
  return headers;
}

export async function checkBackendHealth(): Promise<{ status: string; activeModel?: string; providers?: Record<string, boolean> }> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Health check failed");
    return await res.json();
  } catch {
    return { status: "offline" };
  }
}

export async function getModels(): Promise<ModelInfo[]> {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error("Failed to load model catalog.");
  const data = await res.json();
  return data.models;
}

export async function getServerConfig(): Promise<ServerConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load server config.");
  return await res.json();
}

export async function saveProviderKey(provider: string, apiKey: string, model?: string): Promise<{ success: boolean; message: string; activeModel: string }> {
  const res = await fetch("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save API key.");
  return data;
}

export async function removeProviderKey(provider: string): Promise<void> {
  const res = await fetch(`/api/keys/${provider}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to remove API key.");
  }
}

export async function setActiveModel(model: string): Promise<void> {
  const res = await fetch("/api/config/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error("Failed to set active model.");
}

export async function getUsageSummary(): Promise<UsageSummaryResponse> {
  const res = await fetch("/api/usage");
  if (!res.ok) throw new Error("Failed to load usage summary.");
  return await res.json();
}

export async function generateQuizFromDocuments(params: {
  files: UploadedFileSummary[];
  mcqCount: number;
  theoryCount: number;
  difficulty: string;
  studyFocus?: string;
  excludedQuestions?: string[];
}): Promise<Quiz> {
  const res = await fetch("/api/generate-quiz", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to generate quiz from documents.");
  }
  return data as Quiz;
}

export async function evaluateTheoryAnswer(params: {
  question: string;
  userAnswer: string;
  modelAnswer: string;
  rubric: string[];
  maxScore?: number;
}): Promise<TheoryEvaluation> {
  const res = await fetch("/api/evaluate-theory", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to evaluate theory answer.");
  }
  return data as TheoryEvaluation;
}

export async function askAiTutor(params: {
  questionContext: { question: string; explanation: string; sourceContext?: string };
  chatHistory: TutorChatMessage[];
  userMessage: string;
}): Promise<string> {
  const res = await fetch("/api/ask-tutor", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to connect to AI Tutor.");
  }
  return data.reply;
}
```

(`validateApiKey` is deleted — `saveProviderKey` validates server-side as part of saving.)

- [ ] **Step 4: Temporarily silence remaining consumers**

At this point `SettingsModal.tsx`, `SetupWizard.tsx`, `UploadConfigStep.tsx`, and `Header.tsx` still reference `preferences.apiKey` / `validateApiKey`, so `npm run lint` will fail. Those components are reworked in Tasks 10, 11, and 13 — that is expected. Run the typecheck now and note the failures:

Run: `npm run lint`
Expected: errors mentioning `apiKey` / `validateApiKey` in `SettingsModal.tsx`, `SetupWizard.tsx`, `UploadConfigStep.tsx`, `Header.tsx` — **only** those files. No errors in `types.ts`, `storage.ts`, `api.ts`, or any server file.

- [ ] **Step 5: Run server tests to confirm nothing regressed**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/storage.ts src/lib/api.ts
git commit -m "feat(web): server-side key flow, model header, and legacy preference migration"
```

---

### Task 10: SettingsModal — provider, model, and key management

**Files:**
- Modify: `src/components/SettingsModal.tsx`

**Interfaces:**
- Consumes: `getModels`, `getServerConfig`, `saveProviderKey`, `removeProviderKey`, `getUsageSummary`, `setActiveModel` from Task 9; `UsagePanel` from Task 12 (panel is imported here but created in Task 12 — **execute Task 12 before this task, or create the UsagePanel file in this task**; ordering note: if executing sequentially, do Task 12's component file first)
- Produces: settings UI with provider/model selection and one-time key save

- [ ] **Step 1: Replace the key and model sections of SettingsModal**

Rewrite the component's top section (state + handlers). Replace lines 24–36 (state) with:

```tsx
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("google");
  const [selectedModel, setSelectedModel] = useState<string>(preferences.preferredModel || "");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ success: boolean; message: string } | null>(null);
```

Replace `handleTestKey` (lines 47–75) with:

```tsx
  useEffect(() => {
    getModels()
      .then((list) => {
        setModels(list);
        const initial = preferences.preferredModel || list.find((m) => m.hasKey)?.id || "google:gemini-2.5-flash";
        setSelectedModel(initial);
        setSelectedProvider(initial.split(":")[0]);
      })
      .catch(() => setModels([]));
    getServerConfig().then(setServerConfig).catch(() => setServerConfig(null));
  }, [preferences.preferredModel]);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyStatus({ success: false, message: "Paste your API key first." });
      return;
    }
    setIsSavingKey(true);
    setKeyStatus(null);
    try {
      const res = await saveProviderKey(selectedProvider, apiKeyInput.trim());
      setKeyStatus({ success: true, message: res.message });
      setApiKeyInput("");
      const list = await getModels();
      setModels(list);
      setServerConfig(await getServerConfig());
    } catch (err: any) {
      setKeyStatus({ success: false, message: err.message || "Failed to save API key." });
    } finally {
      setIsSavingKey(false);
    }
  };
```

Add the import updates at the top of the file:

```tsx
import { getModels, getServerConfig, saveProviderKey } from "../lib/api";
import { UserPreferences, AppTheme, ModelInfo, ServerConfig } from "../types";
```

(Remove the `validateApiKey` import.) Update `handleSave` (lines 77–87) to drop `apiKey` and save the model selection:

```tsx
  const handleSave = () => {
    onSavePreferences({
      defaultMcqCount: defaultMcq,
      defaultTheoryCount: defaultTheory,
      defaultDifficulty,
      preferredModel: selectedModel || undefined,
      autoSaveToVault: autoSave,
    });
    if (selectedModel) setActiveModel(selectedModel).catch(() => {});
    onClose();
  };
```

- [ ] **Step 2: Replace Section 1 (key input) and Section 2 (model select) JSX**

Replace the Section 1 block (lines 160–236) and Section 2 block (lines 238–260) with:

```tsx
          {/* Section 1: Provider & API Key */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-red-600" />
              AI Provider & API Key
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                const first = models.find((m) => m.provider === e.target.value);
                if (first) setSelectedModel(first.id);
              }}
              className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
              }`}
            >
              {["google", "anthropic", "openai"].map((p) => (
                <option key={p} value={p}>
                  {p === "google" ? "Google Gemini (free tier available)" : p === "anthropic" ? "Anthropic Claude" : "OpenAI"}
                  {serverConfig?.providers?.[p] ? " ✓ key saved" : ""}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                id="input-settings-api-key"
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setKeyStatus(null);
                }}
                placeholder="Paste API key (saved on this computer, not the browser)"
                className={`w-full border rounded-xl pl-3.5 pr-20 py-2.5 text-xs outline-none font-mono transition-colors min-h-[42px] ${
                  isDark
                    ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                    : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"
                  }`}
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={isSavingKey || !apiKeyInput.trim()}
                  className={`px-2.5 py-1 min-h-[32px] text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                    isDark
                      ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200 disabled:opacity-40"
                      : "bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-700 disabled:opacity-40"
                  }`}
                >
                  {isSavingKey ? "Saving..." : "Save & Test"}
                </button>
              </div>
            </div>

            {keyStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  keyStatus.success
                    ? isDark ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : isDark ? "bg-red-950/40 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {keyStatus.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                )}
                <span>{keyStatus.message}</span>
              </div>
            )}
          </div>

          {/* Section 2: Model Selection */}
          <div className="space-y-2 pt-3 border-t border-inherit">
            <label className="text-xs font-bold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-red-600" />
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
              }`}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerLabel} — {m.label}
                  {m.freeTier ? " (free tier)" : ` ($${m.pricing.input}/$${m.pricing.output} per MTok)`}
                  {m.hasKey ? " ✓" : ""}
                </option>
              ))}
            </select>
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              If a model is overloaded, EduBLAXK retries once, then falls back to a same-or-cheaper model — never to a pricier tier.
            </p>
          </div>
```

Also embed the UsagePanel (Task 12) between Section 2 and Section 3:

```tsx
          <UsagePanel theme={theme} />
```

- [ ] **Step 3: Typecheck and manual check**

Run: `npm run lint`
Expected: errors only in `SetupWizard.tsx`, `UploadConfigStep.tsx`, `Header.tsx` (fixed in Tasks 11 and 13) — none in `SettingsModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(settings): provider/model/key management with server-side key save"
```

---

### Task 11: SetupWizard — provider key step

**Files:**
- Modify: `src/components/SetupWizard.tsx`

**Interfaces:**
- Consumes: `saveProviderKey`, `getModels` from Task 9; `ModelInfo` from Task 9
- Produces: wizard that saves the key server-side and stores the model choice in preferences

- [ ] **Step 1: Replace key state and handlers**

Replace lines 22–29 (state) with:

```tsx
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("google");
  const [selectedModel, setSelectedModel] = useState<string>("google:gemini-2.5-flash");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);
```

Replace `handleTestKey` (lines 40–68) with a single save-and-continue handler:

```tsx
  useEffect(() => {
    getModels()
      .then((list) => {
        setModels(list);
        const withKey = list.find((m) => m.hasKey);
        if (withKey) {
          setSelectedProvider(withKey.provider);
          setSelectedModel(withKey.id);
        }
      })
      .catch(() => setModels([]));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setValidationStatus({ tested: true, success: false, message: "Please paste your API key." });
      return;
    }
    setIsSavingKey(true);
    setValidationStatus(null);
    try {
      const res = await saveProviderKey(selectedProvider, apiKeyInput.trim(), selectedModel);
      setValidationStatus({ tested: true, success: true, message: res.message });
      setApiKeyInput("");
    } catch (err: any) {
      setValidationStatus({ tested: true, success: false, message: err.message || "Failed to save API key." });
    } finally {
      setIsSavingKey(false);
    }
  };
```

Update imports:

```tsx
import { saveProviderKey, getModels } from "../lib/api";
import { UserPreferences, AppTheme, ModelInfo } from "../types";
```

Update `handleFinish` (lines 70–79) — no more `apiKey`, and persist the model:

```tsx
  const handleFinish = () => {
    onSavePreferences({
      hasCompletedWizard: true,
      preferredModel: selectedModel,
      defaultMcqCount: defaultMcq,
      defaultTheoryCount: defaultTheory,
      autoSaveToVault: autoSave,
    });
    onClose();
  };
```

- [ ] **Step 2: Update Step 2 JSX**

Replace the key input block (lines 218–259: the input + show/test buttons) with provider select, model select, and key input:

```tsx
              <div className="space-y-2">
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    const first = models.find((m) => m.provider === e.target.value);
                    if (first) setSelectedModel(first.id);
                  }}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  <option value="google">Google Gemini (recommended — free tier)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                </select>

                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  {models
                    .filter((m) => m.provider === selectedProvider)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.freeTier ? " (free tier)" : ""}
                      </option>
                    ))}
                </select>

                <div className="relative">
                  <input
                    id="input-wizard-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setValidationStatus(null);
                    }}
                    placeholder="Paste your API key"
                    className={`w-full border rounded-xl pl-3.5 pr-20 py-2.5 text-xs outline-none font-mono transition-colors min-h-[42px] ${
                      isDark
                        ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                        : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                        isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"
                      }`}
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveKey}
                      disabled={isSavingKey || !apiKeyInput.trim()}
                      className={`px-2.5 py-1 min-h-[32px] text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                        isDark
                          ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200 disabled:opacity-40"
                          : "bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-700 disabled:opacity-40"
                      }`}
                    >
                      {isSavingKey ? "Saving..." : "Save & Test"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className={`break-words ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Your key is saved in this app's server config on your computer — never in your browser.
                  </span>
                  <a
                    href={selectedProvider === "google" ? "https://aistudio.google.com/app/apikey" : selectedProvider === "anthropic" ? "https://console.anthropic.com/settings/keys" : "https://platform.openai.com/api-keys"}
                    target="_blank"
                    rel="noreferrer"
                    className={`hover:underline flex items-center gap-1 font-semibold shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`}
                  >
                    <span>Get API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
```

Also update the Step 2 heading text (line 209–214): "Google Gemini API Configuration" → "AI Provider Configuration", and the description → "Choose a provider, pick a model, and paste your API key. Gemini has a free tier."

Update the step-2 progress header label (line 119: `2. Gemini Key` → `2. API Key`) and the step-1 button (line 198: `Configure Gemini API Key` → `Configure AI Provider`).

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: errors only in `UploadConfigStep.tsx` and `Header.tsx` (fixed in Task 13).

- [ ] **Step 4: Commit**

```bash
git add src/components/SetupWizard.tsx
git commit -m "feat(wizard): multi-provider key setup with server-side save"
```

---

### Task 12: UsagePanel component

**Files:**
- Create: `src/components/UsagePanel.tsx`

**Interfaces:**
- Consumes: `getUsageSummary` from Task 9; `UsageSummary` from Task 9; `AppTheme` from types
- Produces: `<UsagePanel theme?: AppTheme />` — self-fetching dashboard used by `SettingsModal` (Task 10)

**Note:** create this file before Task 10's commit if executing strictly in order, or immediately after — Task 10 imports it.

- [ ] **Step 1: Implement `src/components/UsagePanel.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { getUsageSummary } from "../lib/api";
import { AppTheme, UsageSummary } from "../types";

interface UsagePanelProps {
  theme?: AppTheme;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({ theme = "red-light" }) => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";

  useEffect(() => {
    getUsageSummary()
      .then((res) => setSummary(res.summary))
      .catch(() => setError("Usage data unavailable."));
  }, []);

  if (error) {
    return <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{error}</p>;
  }
  if (!summary) {
    return <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Loading usage…</p>;
  }

  const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const fmtCost = (n: number) => (n === 0 ? "$0.00" : `$${n.toFixed(4)}`);

  return (
    <div className="space-y-2.5 pt-3 border-t border-inherit">
      <label className="text-xs font-bold flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-red-600" />
        API Usage & Cost
      </label>

      {summary.freeTier?.warning && (
        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Free-tier daily limit approaching: {summary.freeTier.requestsToday} of {summary.freeTier.rpd} requests used today.
            You may start seeing rate-limit errors — consider generating quizzes later or switching models.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
          <div className="font-bold">Today</div>
          <div className={`mt-1 space-y-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <div>{summary.today.requests} requests ({summary.today.failedRequests} failed)</div>
            <div>{fmtTokens(summary.today.inputTokens)} in / {fmtTokens(summary.today.outputTokens)} out tokens</div>
            <div>{fmtCost(summary.today.estCostUsd)} estimated</div>
          </div>
        </div>
        <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
          <div className="font-bold">This month</div>
          <div className={`mt-1 space-y-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <div>{summary.month.requests} requests</div>
            <div>{fmtTokens(summary.month.inputTokens)} in / {fmtTokens(summary.month.outputTokens)} out tokens</div>
            <div>{fmtCost(summary.month.estCostUsd)} estimated</div>
          </div>
        </div>
      </div>

      {summary.perModel.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className={`text-left ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              <th className="py-1 font-semibold">Model</th>
              <th className="py-1 font-semibold text-right">Requests</th>
              <th className="py-1 font-semibold text-right">Tokens</th>
              <th className="py-1 font-semibold text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {summary.perModel.map((m) => (
              <tr key={m.model} className={isDark ? "text-zinc-300" : "text-zinc-600"}>
                <td className="py-1 font-mono">{m.model}</td>
                <td className="py-1 text-right">{m.requests}</td>
                <td className="py-1 text-right">{fmtTokens(m.inputTokens + m.outputTokens)}</td>
                <td className="py-1 text-right">{fmtCost(m.estCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: no errors in `UsagePanel.tsx` or `SettingsModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/UsagePanel.tsx
git commit -m "feat(ui): API usage and cost dashboard panel"
```

---

### Task 13: Upload cap, header status, warnings display, docs, and final verification

**Files:**
- Modify: `src/components/UploadConfigStep.tsx` (lines 38–39, 90, 151–154, 234, 294)
- Modify: `src/components/Header.tsx` (line 26)
- Modify: `src/App.tsx` (quiz generation handler, ~lines 98–115)
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `checkBackendHealth` (now returns `providers`) from Task 9; `Quiz.warnings` from Task 9
- Produces: the finished, verified app

- [ ] **Step 1: UploadConfigStep — 20MB cap and key-free gating**

Change lines 38–39:

```typescript
const MAX_TOTAL_SIZE_MB = 20;
const MAX_TOTAL_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;
```

Change the error message in `handleFiles` (line 90):

```typescript
        setErrorMessage(`Total files exceed the ${MAX_TOTAL_SIZE_MB}MB limit. Could not add "${file.name}".`);
```

Change the gating in `handleStart` (line 151) — keys now live on the server, so only the wizard flag gates:

```typescript
    if (!preferences.hasCompletedWizard) {
      onOpenSettings();
      return;
    }
```

Update the display strings at lines 234 and 294 that hard-code "100MB" to use `{MAX_TOTAL_SIZE_MB}MB` (the JSX at 294: `Select single or multiple files (PDF, TXT, Markdown). Upload up to {MAX_TOTAL_SIZE_MB}MB at once.`).

- [ ] **Step 2: Header — server-side key status**

In `Header.tsx`, the `hasKey` derivation (line 26) no longer works. Replace with a small effect:

```tsx
  const [serverHasProvider, setServerHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendHealth()
      .then((health) => setServerHasProvider(Boolean(Object.values(health.providers ?? {}).some(Boolean))))
      .catch(() => setServerHasProvider(null));
  }, []);
```

Replace every use of `hasKey` in the JSX with `serverHasProvider` (keep the same conditional rendering — `null` means offline/unknown and should render the neutral state it renders today when the key is absent).

- [ ] **Step 3: App.tsx — show truncation warnings after generation**

In `App.tsx`, find the `handleGenerateQuiz` success path (the block after `const quiz = await generateQuizFromDocuments({...})`, around line 98). After the quiz state is set, surface its warnings. Add state next to `errorMessage` (line 51):

```tsx
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
```

In the success path (right where `setActiveQuiz(quiz)` / view transition happens), add:

```tsx
      setNoticeMessage(
        quiz.warnings && quiz.warnings.length > 0
          ? `Note: ${quiz.warnings.join(" ")} Questions cover only the first part of the truncated document(s).`
          : null
      );
```

Render an amber banner directly above the existing red error banner (near line 380 — same dismiss pattern):

```tsx
        {noticeMessage && currentView === "quiz" && (
          <div className="mx-auto w-full max-w-5xl px-2 sm:px-0">
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start justify-between gap-3">
              <span>{noticeMessage}</span>
              <button onClick={() => setNoticeMessage(null)} className="shrink-0 font-bold cursor-pointer">✕</button>
            </div>
          </div>
        )}
```

(If `handleGenerateQuiz` navigates to the quiz view immediately, the banner appears on the quiz screen; adjust the conditional to `currentView !== "create"` if the app returns to the create view on failure — match the existing error banner's placement logic.)

- [ ] **Step 4: Update `.env.example`**

```
# Optional: seed the Google Gemini API key on first boot.
# After the app runs once, keys are managed in Settings (stored in .edublaxk/keys.json).
GEMINI_API_KEY=
```

- [ ] **Step 5: Update README**

In `README.md`, update the setup section: replace any "paste your Gemini API key in the wizard, stored in your browser" wording with: keys are configured in the setup wizard or Settings and stored **on the local machine in `.edublaxk/keys.json`** (gitignored), never in the browser. Add a short "Supported providers" list (Google Gemini — free tier default; Anthropic Claude; OpenAI) and a note that API usage/cost is visible in Settings → API Usage.

- [ ] **Step 6: Full verification**

```bash
npm run lint
npm test
npm run build
```

Expected: all three succeed.

- [ ] **Step 7: Manual smoke test (requires a real Gemini key)**

Run: `GEMINI_API_KEY=<key> npm run dev`, then in the browser:
1. Complete the wizard with the Gemini key → "Save & Test" succeeds, `.edublaxk/keys.json` created (check with `ls .edublaxk/`)
2. Generate a quiz from a small PDF → quiz renders; `localStorage` contains no `documents`/`dataUrl` in the new attempt; Settings → API Usage shows one generate-quiz request with tokens
3. Ask the tutor a follow-up → reply arrives; usage counter increments
4. Enter a bogus key in Settings → "Save & Test" fails fast with one clear message (no retry cascade)
5. Old localStorage data (if present) still renders in History Vault

- [ ] **Step 8: Commit**

```bash
git add src/components/UploadConfigStep.tsx src/components/Header.tsx src/App.tsx .env.example README.md
git commit -m "feat(web): 20MB cap, server key status, truncation warnings, and docs"
```

---

## Plan Self-Review (already applied)

- **Spec coverage:** catalog (T2), Zod schemas (T3), keys.json + .env seeding (T4), ledger + aggregation + prune (T5), extraction + cache + truncation (T6), retry policy per spec table (T7), all routes + 20MB cap + quiz-without-documents (T8), x-model header + legacy migration (T9), settings/wizard/usage UI (T10–12), free-tier warning banner (T5+T12), client cap + warnings + docs (T13). Manual smoke test covers the real-key path.
- **Type consistency:** `UsageSummary`/`UsageBucket`/`ModelInfo`/`ServerConfig` defined once in Task 9 and mirrored by server shapes in Tasks 5/8; `dataDir(baseDir?)` signature shared by keys/usage/extract; router's `AiRouterError.kind` values match the routes' `aiErrorResponse` mapping.
- **Known risks flagged inline:** AI SDK v5 parameter names (`maxTokens`, `APICallError` constructor) must be checked against the installed version (Task 7); the minimal PDF fixture may need regeneration (Task 6); `openai:gpt-5-mini` pricing needs verification (Task 2).
