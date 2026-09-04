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
