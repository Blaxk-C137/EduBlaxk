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
    perModelMap.set(rec.model, { ...addTo(existing, rec), model: rec.model });
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
