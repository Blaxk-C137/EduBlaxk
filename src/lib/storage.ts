import { QuizAttempt, UserPreferences, Question, StoredQuestionRecord, QuestionBankStats } from "../types";

const STORAGE_KEYS = {
  PREFERENCES: "edublaxk_preferences_v1",
  ATTEMPTS: "edublaxk_attempts_v1",
  SAVED_QUIZZES: "edublaxk_saved_quizzes_v1",
  QUESTION_BANK: "edublaxk_question_bank_v1",
};

export function normalizeDocKey(docNames: string[]): string {
  if (!docNames || docNames.length === 0) return "unnamed_document";
  return docNames
    .map((n) => n.trim().toLowerCase())
    .sort()
    .join("::");
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  hasCompletedWizard: false,
  defaultMcqCount: 10,
  defaultTheoryCount: 3,
  defaultDifficulty: "Intermediate",
  autoSaveToVault: true,
  timerMinutesPerQuestion: 1.5,
  theme: "red-light",
};

// Mirrors server/ai/catalog.ts LEGACY_MODEL_MAP — old prefs stored bare Gemini names.
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "google:gemini-2.5-flash",
  "gemini-2.5-flash-lite": "google:gemini-2.5-flash-lite",
  "gemini-2.5-pro": "google:gemini-2.5-flash",
  "gemini-2.0-flash": "google:gemini-2.5-flash",
};

function migratePreferences(parsed: Partial<UserPreferences> & { apiKey?: string }): Partial<UserPreferences> {
  // API keys moved to the server in the API rework — never store them in the browser again.
  delete parsed.apiKey;
  if (typeof parsed.preferredModel === "string" && !parsed.preferredModel.includes(":")) {
    const mapped = LEGACY_MODEL_MAP[parsed.preferredModel];
    if (mapped) parsed.preferredModel = mapped;
    else delete parsed.preferredModel;
  }
  return parsed;
}

export function getStoredPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    migratePreferences(parsed);
    if (parsed.theme === "editorial-light" || !parsed.theme) {
      parsed.theme = "red-light";
    } else if (parsed.theme === "carbon-dark" || parsed.theme === "dark-crimson" || parsed.theme === "sapphire-navy") {
      parsed.theme = "black-red-dark";
    }
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch (e) {
    console.error("Failed to load preferences:", e);
    return DEFAULT_PREFERENCES;
  }
}

export function saveStoredPreferences(prefs: Partial<UserPreferences>): UserPreferences {
  try {
    const current = getStoredPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("Failed to save preferences:", e);
    return DEFAULT_PREFERENCES;
  }
}

export function getStoredAttempts(): QuizAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to load quiz attempts:", e);
    return [];
  }
}

export function saveStoredAttempt(attempt: QuizAttempt): void {
  try {
    const attempts = getStoredAttempts();
    // Prepend new attempt, filter duplicates
    const updated = [attempt, ...attempts.filter((a) => a.id !== attempt.id)];
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(updated));
    
    // Also ensure all questions from this attempt are synced to the question bank JSON
    if (attempt.quiz?.questions && attempt.quiz.documentNames) {
      saveQuestionsToBank(attempt.quiz.documentNames, attempt.quiz.questions, attempt.quizTitle);
    }
  } catch (e) {
    console.error("Failed to save attempt:", e);
  }
}

export function deleteStoredAttempt(id: string): void {
  try {
    const attempts = getStoredAttempts();
    const updated = attempts.filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to delete attempt:", e);
  }
}

// -------------------------------------------------------------
// QUESTION BANK PERSISTENCE (Anti-duplication JSON Store)
// -------------------------------------------------------------

export function getStoredQuestionBank(): StoredQuestionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUESTION_BANK);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to load question bank:", e);
    return [];
  }
}

export function saveQuestionsToBank(
  documentNames: string[],
  questions: Question[],
  sourceQuizTitle?: string
): void {
  try {
    if (!questions || questions.length === 0) return;
    const bank = getStoredQuestionBank();
    const docKey = normalizeDocKey(documentNames);
    const existingPrompts = new Set(bank.map((q) => q.question.trim().toLowerCase()));

    const newRecords: StoredQuestionRecord[] = [];

    for (const q of questions) {
      const normalizedPrompt = (q.question || "").trim().toLowerCase();
      if (!normalizedPrompt || existingPrompts.has(normalizedPrompt)) {
        continue;
      }

      existingPrompts.add(normalizedPrompt);
      newRecords.push({
        id: q.id || `bank-q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        documentNames: documentNames && documentNames.length > 0 ? documentNames : ["Educational Document"],
        docKey,
        question: q.question,
        type: q.type,
        options: q.type === "mcq" ? (q as any).options : undefined,
        correctAnswerIndex: q.type === "mcq" ? (q as any).correctAnswerIndex : undefined,
        explanation: q.explanation,
        modelAnswer: q.type === "theory" ? (q as any).modelAnswer : undefined,
        theoryRubric: q.type === "theory" ? (q as any).theoryRubric : undefined,
        topic: q.topic,
        difficulty: q.difficulty,
        sourceContext: q.sourceContext,
        createdAt: new Date().toISOString(),
        sourceQuizTitle,
      });
    }

    if (newRecords.length > 0) {
      const updatedBank = [...newRecords, ...bank];
      localStorage.setItem(STORAGE_KEYS.QUESTION_BANK, JSON.stringify(updatedBank));
    }
  } catch (e) {
    console.error("Failed to save questions to bank:", e);
  }
}

// Retrieve past question strings for specific document(s) so Gemini avoids repetition
export function getPreviousQuestionsForDocuments(documentNames: string[]): string[] {
  try {
    const bank = getStoredQuestionBank();
    if (bank.length === 0 || !documentNames || documentNames.length === 0) return [];

    const targetNames = new Set(documentNames.map((n) => n.trim().toLowerCase()));
    const targetKey = normalizeDocKey(documentNames);

    const matchingQuestions: string[] = [];

    for (const record of bank) {
      // Check if exact docKey match OR any shared document name
      const isDocKeyMatch = record.docKey === targetKey;
      const sharesDoc = record.documentNames?.some((docName) => targetNames.has(docName.trim().toLowerCase()));

      if (isDocKeyMatch || sharesDoc) {
        if (record.question && record.question.trim()) {
          matchingQuestions.push(record.question.trim());
        }
      }
    }

    return Array.from(new Set(matchingQuestions));
  } catch (e) {
    console.error("Failed to retrieve previous questions:", e);
    return [];
  }
}

export function getQuestionBankStats(): QuestionBankStats {
  const bank = getStoredQuestionBank();
  const documentMap: Record<string, number> = {};
  const docNamesSet = new Set<string>();

  for (const q of bank) {
    const docLabel = q.documentNames?.join(", ") || "General Document";
    documentMap[docLabel] = (documentMap[docLabel] || 0) + 1;
    q.documentNames?.forEach((d) => docNamesSet.add(d));
  }

  return {
    totalQuestions: bank.length,
    totalDocuments: docNamesSet.size,
    documentMap,
  };
}

export function clearStoredQuestionBank(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.QUESTION_BANK);
  } catch (e) {
    console.error("Failed to clear question bank:", e);
  }
}

export function exportQuestionBankJSON(): void {
  const bank = getStoredQuestionBank();
  const stats = getQuestionBankStats();

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    generator: "EduBLAXK - Local AI Tutor",
    description: "Question Bank & Anti-Duplication Memory Archive",
    stats,
    totalUniqueQuestions: bank.length,
    questions: bank,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edublaxk_question_bank_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function clearAllStoredData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.SAVED_QUIZZES);
    localStorage.removeItem(STORAGE_KEYS.QUESTION_BANK);
  } catch (e) {
    console.error("Failed to clear local vault data:", e);
  }
}

// Export complete vault as downloadable JSON backup file
export function exportVaultJSON(): void {
  const attempts = getStoredAttempts();
  const preferences = getStoredPreferences();
  const questionBank = getStoredQuestionBank();
  
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    generator: "EduBLAXK - Local AI Tutor",
    preferences: {
      defaultMcqCount: preferences.defaultMcqCount,
      defaultTheoryCount: preferences.defaultTheoryCount,
      defaultDifficulty: preferences.defaultDifficulty,
    },
    totalAttempts: attempts.length,
    totalIndexedQuestions: questionBank.length,
    attempts,
    questionBank,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edublaxk_history_vault_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import vault from a JSON file
export function importVaultJSON(jsonData: string): { success: boolean; count: number; message: string } {
  try {
    const parsed = JSON.parse(jsonData);
    if (!parsed || (!Array.isArray(parsed.attempts) && !Array.isArray(parsed.questions))) {
      return { success: false, count: 0, message: "Invalid EduBLAXK vault format. Missing 'attempts' or 'questions' array." };
    }

    let addedAttempts = 0;
    let addedQuestions = 0;

    if (Array.isArray(parsed.attempts)) {
      const currentAttempts = getStoredAttempts();
      const mergedMap = new Map<string, QuizAttempt>();

      currentAttempts.forEach((att) => mergedMap.set(att.id, att));
      parsed.attempts.forEach((att: QuizAttempt) => {
        if (att && att.id) {
          mergedMap.set(att.id, att);
        }
      });

      const mergedList = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(mergedList));
      addedAttempts = parsed.attempts.length;
    }

    if (Array.isArray(parsed.questionBank) || Array.isArray(parsed.questions)) {
      const questionsToImport = parsed.questionBank || parsed.questions;
      const currentBank = getStoredQuestionBank();
      const existingIds = new Set(currentBank.map((q) => q.id));
      const existingPrompts = new Set(currentBank.map((q) => q.question.trim().toLowerCase()));

      const toAdd: StoredQuestionRecord[] = [];
      for (const q of questionsToImport) {
        if (q && q.question && !existingPrompts.has(q.question.trim().toLowerCase())) {
          existingPrompts.add(q.question.trim().toLowerCase());
          toAdd.push(q);
        }
      }

      if (toAdd.length > 0) {
        const mergedBank = [...toAdd, ...currentBank];
        localStorage.setItem(STORAGE_KEYS.QUESTION_BANK, JSON.stringify(mergedBank));
        addedQuestions = toAdd.length;
      }
    }

    return {
      success: true,
      count: addedAttempts + addedQuestions,
      message: `Successfully imported ${addedAttempts} assessment records and ${addedQuestions} questions into local vault!`,
    };
  } catch (e: any) {
    return { success: false, count: 0, message: e?.message || "Failed to parse JSON file." };
  }
}


// Generate printable HTML Report
export function printAttemptReport(attempt: QuizAttempt): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to open the printable report.");
    return;
  }

  const mcqQuestions = attempt.quiz.questions.filter((q) => q.type === "mcq");
  const theoryQuestions = attempt.quiz.questions.filter((q) => q.type === "theory");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>EduBLAXK Assessment Report - ${attempt.quizTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111; max-width: 850px; margin: 0 auto; padding: 40px 20px; }
    .header { border-bottom: 2px solid #e11d48; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 24px; font-weight: 800; color: #09090b; margin: 0; }
    .tagline { font-size: 13px; color: #e11d48; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-box { background: #fff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; text-align: center; }
    .stat-val { font-size: 20px; font-weight: bold; color: #09090b; }
    .stat-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .q-item { border-left: 3px solid #cbd5e1; padding-left: 14px; margin-bottom: 24px; page-break-inside: avoid; }
    .q-item.correct { border-color: #10b981; }
    .q-item.incorrect { border-color: #ef4444; }
    .badge { display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; }
    .badge-correct { background: #d1fae5; color: #065f46; }
    .badge-incorrect { background: #fee2e2; color: #991b1b; }
    .explanation { background: #f1f5f9; padding: 10px; border-radius: 4px; font-size: 13px; margin-top: 8px; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 12px; text-align: center; color: #64748b; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="tagline">EduBLAXK • Local AI Tutor</div>
      <h1 class="title">${escapeHtml(attempt.quizTitle)}</h1>
      <div style="font-size: 13px; color: #64748b;">Assessed on ${new Date(attempt.timestamp).toLocaleDateString()} at ${new Date(attempt.timestamp).toLocaleTimeString()}</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 32px; font-weight: 900; color: #e11d48;">${Math.round(attempt.overallPercentage)}%</div>
      <div class="badge" style="background: #09090b; color: #fff;">${attempt.ratingGrade}</div>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-val">${attempt.mcqCorrect} / ${attempt.mcqTotal}</div>
      <div class="stat-lbl">MCQ Accuracy</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${attempt.theoryEarnedPoints} / ${attempt.theoryTotalPoints}</div>
      <div class="stat-lbl">Theory Score</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${Math.floor(attempt.timeTakenSeconds / 60)}m ${attempt.timeTakenSeconds % 60}s</div>
      <div class="stat-lbl">Time Taken</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${attempt.quiz.difficulty}</div>
      <div class="stat-lbl">Rigor Level</div>
    </div>
  </div>

  <div class="card">
    <strong>Source Materials:</strong> ${attempt.quiz.documentNames.join(", ") || "Uploaded Educational Documents"}<br/>
    <strong>Topics Covered:</strong> ${attempt.quiz.topicsCovered.join(" • ")}
  </div>

  <h2 style="font-size: 18px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-top: 30px;">Multiple Choice Breakdown (${mcqQuestions.length} Questions)</h2>
  ${mcqQuestions
    .map((q, index) => {
      const ans = attempt.answers[q.id];
      const isCorrect = ans?.isCorrect;
      const selectedIndex = ans?.selectedOptionIndex ?? -1;
      return `
      <div class="q-item ${isCorrect ? "correct" : "incorrect"}">
        <div style="display: flex; justify-content: space-between;">
          <strong>Q${index + 1}: ${escapeHtml(q.question)}</strong>
          <span class="badge ${isCorrect ? "badge-correct" : "badge-incorrect"}">${isCorrect ? "CORRECT" : "INCORRECT"}</span>
        </div>
        <div style="margin-top: 8px; font-size: 14px;">
          ${(q as any).options
            .map((opt: string, optIdx: number) => {
              const isSelected = selectedIndex === optIdx;
              const isActualCorrect = (q as any).correctAnswerIndex === optIdx;
              let style = "padding: 4px 8px; margin: 4px 0; border-radius: 4px;";
              if (isActualCorrect) style += " background: #d1fae5; font-weight: bold; color: #065f46;";
              else if (isSelected && !isActualCorrect) style += " background: #fee2e2; color: #991b1b; text-decoration: line-through;";
              return `<div style="${style}">${String.fromCharCode(65 + optIdx)}. ${escapeHtml(opt)} ${isSelected ? "(Your Answer)" : ""} ${isActualCorrect ? "✓" : ""}</div>`;
            })
            .join("")}
        </div>
        <div class="explanation">
          <strong>Explanation:</strong> ${escapeHtml(q.explanation)}<br/>
          ${q.sourceContext ? `<em style="color: #475569;">Reference: "${escapeHtml(q.sourceContext)}"</em>` : ""}
        </div>
      </div>
      `;
    })
    .join("")}

  ${
    theoryQuestions.length > 0
      ? `
    <h2 style="font-size: 18px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-top: 40px;">Theory & Open-Ended Assessment (${theoryQuestions.length} Questions)</h2>
    ${theoryQuestions
      .map((q, index) => {
        const ans = attempt.answers[q.id];
        const evalData = ans?.theoryEvaluation;
        return `
        <div class="q-item" style="border-color: #6366f1;">
          <strong>Theory Q${index + 1}: ${escapeHtml(q.question)}</strong>
          <div style="margin: 10px 0; padding: 10px; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px;">
            <strong>Your Submitted Answer:</strong><br/>
            <div style="white-space: pre-wrap; font-size: 13.5px; color: #334155; margin-top: 4px;">${escapeHtml(ans?.textAnswer || "No answer provided.")}</div>
          </div>
          ${
            evalData
              ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-top: 8px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #166534;">
                <span>AI Rubric Evaluation</span>
                <span>Score: ${evalData.score} / ${evalData.maxScore} (${Math.round(evalData.percentage)}%)</span>
              </div>
              <p style="font-size: 13px; color: #15803d; margin: 6px 0;">${escapeHtml(evalData.feedback)}</p>
              ${
                evalData.keyPointsAddressed?.length > 0
                  ? `<div style="font-size: 12px; color: #166534;"><strong>Key Points Addressed:</strong> ${evalData.keyPointsAddressed.map((p) => `✓ ${escapeHtml(p)}`).join(", ")}</div>`
                  : ""
              }
              ${
                evalData.missingKeyPoints?.length > 0
                  ? `<div style="font-size: 12px; color: #991b1b; margin-top: 4px;"><strong>Concepts to Strengthen:</strong> ${evalData.missingKeyPoints.map((p) => `• ${escapeHtml(p)}`).join(", ")}</div>`
                  : ""
              }
            </div>
            `
              : ""
          }
          <div class="explanation" style="margin-top: 10px;">
            <strong>Model Answer:</strong><br/>
            <div style="white-space: pre-wrap; margin-top: 4px;">${escapeHtml((q as any).modelAnswer)}</div>
          </div>
        </div>
        `;
      })
      .join("")}
  `
      : ""
  }

  <div class="footer">
    I Love OPEN SOURCE ~ Blaxk
  </div>
  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
