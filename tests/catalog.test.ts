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
