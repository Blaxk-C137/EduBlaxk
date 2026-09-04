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
