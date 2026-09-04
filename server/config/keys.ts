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
