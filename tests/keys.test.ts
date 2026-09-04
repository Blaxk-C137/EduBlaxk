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
