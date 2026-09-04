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
