import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { DEFAULT_MODEL, MODEL_CATALOG, PROVIDER_LABELS, ProviderId } from "./server/ai/catalog";
import { AiRouterError, structuredCall, textCall, validateProviderKey } from "./server/ai/router";
import { quizSchema, evaluationSchema } from "./server/ai/schemas";
import { loadKeys, removeProviderKey, setActiveModel, setProviderKey } from "./server/config/keys";
import { aggregateUsage, loadUsage, pruneUsage } from "./server/config/usage";
import { extractDocuments } from "./server/documents/extract";

dotenv.config();

export const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// 20MB body limit (spec: kills the old 100MB base64 firehose)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const PROVIDERS: ProviderId[] = ["google", "anthropic", "openai"];

function providerKeyStatus(): Record<ProviderId, boolean> {
  const keys = loadKeys();
  return {
    google: Boolean(keys.providers.google),
    anthropic: Boolean(keys.providers.anthropic),
    openai: Boolean(keys.providers.openai),
  };
}

function modelFromHeader(req: express.Request): string | undefined {
  const raw = req.headers["x-model"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function aiErrorResponse(res: express.Response, err: unknown) {
  if (err instanceof AiRouterError) {
    const status = err.kind === "auth" ? 400 : err.kind === "rate_limit" ? 429 : err.kind === "overloaded" ? 503 : 500;
    res.status(status).json({ error: err.message, kind: err.kind, retryAfterMinutes: err.retryAfterMinutes });
    return;
  }
  console.error("[EduBLAXK] AI error:", err);
  res.status(500).json({ error: (err as any)?.message || "AI request failed." });
}

// API: Health check
app.get("/api/health", (_req, res) => {
  const keys = loadKeys();
  res.json({
    status: "ok",
    activeModel: keys.activeModel,
    providers: providerKeyStatus(),
    timestamp: new Date().toISOString(),
  });
});

// API: Model catalog (public info only — no keys)
app.get("/api/models", (_req, res) => {
  const keyStatus = providerKeyStatus();
  res.json({
    models: MODEL_CATALOG.map((m) => ({
      id: m.id,
      provider: m.provider,
      providerLabel: PROVIDER_LABELS[m.provider],
      label: m.label,
      tier: m.tier,
      pricing: m.pricing,
      freeTier: m.freeTier,
      hasKey: keyStatus[m.provider],
    })),
  });
});

// API: Client config (which providers are usable — never the keys)
app.get("/api/config", (_req, res) => {
  const keys = loadKeys();
  res.json({ activeModel: keys.activeModel, providers: providerKeyStatus() });
});

// API: Save (and validate) a provider key
app.post("/api/keys", async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body ?? {};
    if (!PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Unknown provider "${provider}".` });
      return;
    }
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      res.status(400).json({ error: "Please provide an API key." });
      return;
    }
    await validateProviderKey(provider, apiKey.trim());
    setProviderKey(provider, apiKey.trim());
    if (model) setActiveModel(model);
    const keys = loadKeys();
    res.json({ success: true, message: `${PROVIDER_LABELS[provider]} key saved and validated.`, activeModel: keys.activeModel });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Remove a provider key
app.delete("/api/keys/:provider", (req, res) => {
  const provider = req.params.provider as ProviderId;
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: `Unknown provider "${provider}".` });
    return;
  }
  removeProviderKey(provider);
  // If the active model belonged to the removed provider, fall back to the default.
  const keys = loadKeys();
  if (keys.activeModel.startsWith(`${provider}:`) || !keys.providers[keys.activeModel.split(":")[0] as ProviderId]) {
    if (!keys.providers[keys.activeModel.split(":")[0] as ProviderId]) {
      setActiveModel(DEFAULT_MODEL);
    }
  }
  res.json({ success: true, activeModel: loadKeys().activeModel });
});

// API: Set the default model
app.post("/api/config/model", (req, res) => {
  const { model } = req.body ?? {};
  if (!MODEL_CATALOG.some((m) => m.id === model)) {
    res.status(400).json({ error: `Unknown model "${model}".` });
    return;
  }
  setActiveModel(model);
  res.json({ success: true, activeModel: loadKeys().activeModel });
});

// API: Usage summary
app.get("/api/usage", (_req, res) => {
  const keys = loadKeys();
  res.json({ summary: aggregateUsage(loadUsage(), keys.activeModel) });
});

// API: Generate Quiz from Document(s)
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { files, mcqCount = 10, theoryCount = 3, difficulty = "Intermediate", studyFocus = "", excludedQuestions = [] } =
      req.body ?? {};

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "Please upload at least one educational document/PDF." });
      return;
    }

    const docs = await extractDocuments(files);
    if (docs.length === 0) {
      res.status(400).json({ error: "No readable text found in the uploaded files. PDFs must contain selectable text." });
      return;
    }

    const warnings = docs.filter((d) => d.truncated).map((d) => `"${d.name}" was truncated to fit the model context.`);

    const deduplicationInstructions =
      Array.isArray(excludedQuestions) && excludedQuestions.length > 0
        ? `
=========================================
CRITICAL ANTI-DUPLICATION MANDATE:
The student has already practiced questions from this document and wants MORE FRESH QUESTIONS.
DO NOT repeat, rephrase, or re-test any of the following ${excludedQuestions.length} previously generated questions:
${excludedQuestions
  .slice(0, 75)
  .map((q: string, idx: number) => `${idx + 1}. "${q.trim()}"`)
  .join("\n")}

REQUIREMENT: Every single new question MUST be completely novel, exploring alternative topics, different formulas, deeper reasoning, complementary sections, other figures, or untested concepts from the document(s).
=========================================
`
        : "";

    const documentText = docs
      .map((d) => `[DOCUMENT: ${d.name}]\n${d.text}`)
      .join("\n\n");

    const promptInstructions = `${documentText}

You are EduBLAXK, an elite Local AI Tutor and educational assessment specialist.
Analyze the attached educational document(s) thoroughly and create a high-rigor, high-quality assessment quiz based STRICTLY on the facts, theories, methodologies, concepts, and details contained within the documents.

Target Specifications:
- Multiple Choice Questions (MCQ): EXACTLY ${mcqCount} questions.
  - Each MCQ must have 4 distinct, plausible options.
  - Exactly one correct answer with index (0, 1, 2, or 3).
  - Clear explanation of why the correct option is right and why distractors are wrong.
  - Include an exact quote or context reference from the document (sourceContext).
- Theory / Open-Ended Questions: EXACTLY ${theoryCount} questions.
  - Thought-provoking conceptual or problem-solving questions testing deep understanding.
  - Provide an exemplary model answer.
  - Provide a clear scoring rubric with 3 to 5 key points/criteria expected from a complete student response.
  - Include source context from the document.
- Target Academic Level: ${difficulty}.
${studyFocus ? `- Specific Study Focus Requested: "${studyFocus}"` : ""}
${deduplicationInstructions}

Generate questions that test both foundational knowledge and applied analytical reasoning. Avoid trivial, superficial, or ambiguous questions.
`;

    const quizData = await structuredCall({
      endpoint: "generate-quiz",
      selection: modelFromHeader(req),
      schema: quizSchema,
      system:
        "You are EduBLAXK, an expert local educational tutor. You extract accurate quizzes and theory questions from user documents. Output strictly valid JSON matching the requested schema.",
      prompt: promptInstructions,
    });

    const normalizedQuestions = (quizData.questions || []).map((q, idx) => ({
      id: q.id || `q-${idx + 1}-${Date.now()}`,
      type: q.type === "theory" ? "theory" : "mcq",
      question: q.question || `Question ${idx + 1}`,
      options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : q.type === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : [],
      correctAnswerIndex: typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0,
      explanation: q.explanation || "No explanation provided.",
      sourceContext: q.sourceContext || "Extracted from uploaded materials.",
      modelAnswer: q.modelAnswer || (q.type === "theory" ? "Comprehensive conceptual response based on document." : ""),
      theoryRubric:
        Array.isArray(q.theoryRubric) && q.theoryRubric.length > 0
          ? q.theoryRubric
          : ["Identifies core underlying concept correctly", "Provides logical explanation supported by facts", "Uses accurate subject terminology"],
      topic: q.topic || "Core Subject",
      difficulty: q.difficulty || "medium",
    }));

    res.json({
      id: `quiz-${Date.now()}`,
      title: quizData.title || "EduBLAXK Educational Assessment",
      summary: quizData.summary || "Comprehensive assessment generated from your study documents.",
      createdAt: new Date().toISOString(),
      documentNames: docs.map((d) => d.name),
      totalQuestions: normalizedQuestions.length,
      mcqCount: normalizedQuestions.filter((q) => q.type === "mcq").length,
      theoryCount: normalizedQuestions.filter((q) => q.type === "theory").length,
      difficulty,
      topicsCovered: quizData.topicsCovered || ["General Concepts"],
      questions: normalizedQuestions,
      warnings,
    });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Evaluate Student Theory Answer
app.post("/api/evaluate-theory", async (req, res) => {
  try {
    const { question, userAnswer, modelAnswer, rubric = [], maxScore = 5 } = req.body ?? {};
    if (!question || !userAnswer) {
      res.status(400).json({ error: "Question and user answer are required for evaluation." });
      return;
    }

    const evaluationPrompt = `You are EduBLAXK, an encouraging but academically rigorous tutor grading a student's theory response.
Evaluate the student's answer against the question, model answer, and rubric criteria.

Question: "${question}"
Student's Answer: "${userAnswer}"
Exemplary Model Answer: "${modelAnswer}"
Grading Rubric Criteria:
${rubric.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

Max Score: ${maxScore} points.

Evaluate fairly:
- Award partial credit where valid understanding is demonstrated.
- Be objective and specific in your feedback.
- Identify which key rubric points were addressed and which were missed.
- Give 2 actionable improvement tips for revision.
`;

    const evaluation = await structuredCall({
      endpoint: "evaluate-theory",
      selection: modelFromHeader(req),
      schema: evaluationSchema,
      prompt: evaluationPrompt,
    });

    res.json({
      ...evaluation,
      score: Math.max(0, Math.min(evaluation.score, maxScore)),
      maxScore,
      percentage: Math.max(0, Math.min(evaluation.percentage, 100)),
    });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// API: Ask AI Tutor
app.post("/api/ask-tutor", async (req, res) => {
  try {
    const { questionContext, chatHistory = [], userMessage } = req.body ?? {};
    if (!userMessage) {
      res.status(400).json({ error: "A message is required." });
      return;
    }

    const historyMessages = (chatHistory as Array<{ role: string; content: string }>).map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const systemInstruction = `You are the EduBLAXK Local AI Tutor ("I Love OPEN SOURCE ~ Blaxk").
You are tutoring a student on an assessment question.
Question Context:
- Question: "${questionContext?.question || "Assessment item"}"
- Correct Concept/Explanation: "${questionContext?.explanation || "Educational standard"}"
- Document Reference: "${questionContext?.sourceContext || "Source text"}"

Guidelines:
- Explain concepts with clarity, intuition, and real-world analogies.
- Be concise, direct, supportive, and pedagogical.
- If the student is confused about why an option is right or wrong, break it down step-by-step.
- Avoid rambling; keep responses focused on active learning.
`;

    const reply = await textCall({
      endpoint: "ask-tutor",
      selection: modelFromHeader(req),
      system: systemInstruction,
      messages: [...historyMessages, { role: "user", content: userMessage }],
    });

    res.json({ reply: reply || "I'm here to help clarify any part of this concept!" });
  } catch (err) {
    aiErrorResponse(res, err);
  }
});

// Vite Middleware for Dev and Static Serving for Production
async function startServer() {
  pruneUsage();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EduBLAXK Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Do not listen when running under vitest (route tests import `app` directly).
if (!process.env.VITEST) {
  startServer();
}
