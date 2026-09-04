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
    expect(summary.month.requests).toBe(2); // August 15 falls outside the September calendar month
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
