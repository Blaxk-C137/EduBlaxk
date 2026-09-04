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
      // Explicit type args resolve the SDK's conditional OUTPUT type, which
      // stays deferred for a bare generic schema and fails the Prompt check.
      const res = await generateObject<S, "object", z.infer<S>>({
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
      // AI SDK Prompt accepts exactly one of `prompt` or `messages` (not both),
      // so pick based on what the caller supplied.
      const res = await generateText({
        model: buildLanguageModel(modelId, apiKey),
        system: args.system,
        ...(args.messages
          ? { messages: args.messages as Array<{ role: "user"; content: string } | { role: "assistant"; content: string }> }
          : { prompt: args.prompt ?? "" }),
        maxOutputTokens: 2048,
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
      maxOutputTokens: 8,
    });
    return { result: res.text, usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 } };
  });
}
