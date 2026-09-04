import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
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

import { AiRouterError, structuredCall, textCall, validateProviderKey } from "../server/ai/router";
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
    (validateProviderKey as any).mockRejectedValue(new AiRouterError("Your google API key is invalid.", "auth"));
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
