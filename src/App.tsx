/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { SetupWizard } from "./components/SetupWizard";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryVault } from "./components/HistoryVault";
import { UploadConfigStep } from "./components/UploadConfigStep";
import { QuizPlayer } from "./components/QuizPlayer";
import { QuizResults } from "./components/QuizResults";
import { AskTutorDrawer } from "./components/AskTutorDrawer";
import {
  Quiz,
  Question,
  QuizAttempt,
  UserAnswer,
  UserPreferences,
  UploadedFileSummary,
} from "./types";
import {
  getStoredPreferences,
  saveStoredPreferences,
  getStoredAttempts,
  saveStoredAttempt,
  deleteStoredAttempt,
  getPreviousQuestionsForDocuments,
} from "./lib/storage";
import { generateQuizFromDocuments, evaluateTheoryAnswer, checkBackendHealth } from "./lib/api";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";

export default function App() {
  const [preferences, setPreferences] = useState<UserPreferences>(getStoredPreferences);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(getStoredAttempts);

  const [isWizardOpen, setIsWizardOpen] = useState(!preferences.hasCompletedWizard);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState<Question | null>(null);

  const [currentView, setCurrentView] = useState<"create" | "quiz" | "results">("create");
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [quizMode, setQuizMode] = useState<"practice" | "exam">("practice");

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("Analyzing documents...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const currentTheme = preferences.theme || "red-light";
  const isDark = currentTheme === "black-red-dark" || currentTheme === "carbon-dark";
  const isLight = !isDark;

  // Check server health on mount
  useEffect(() => {
    checkBackendHealth().then(() => {});
  }, []);

  const handleSavePreferences = (newPrefs: Partial<UserPreferences>) => {
    const updated = saveStoredPreferences(newPrefs);
    setPreferences(updated);
  };

  const handleRefreshVault = () => {
    setAttempts(getStoredAttempts());
  };

  const handleGenerateQuiz = async (params: {
    files: UploadedFileSummary[];
    mcqCount: number;
    theoryCount: number;
    difficulty: string;
    studyFocus: string;
    mode: "practice" | "exam";
    excludedQuestions?: string[];
  }) => {
    setIsLoading(true);
    setLoadingStage("Reading document structures & extracting key concepts with Gemini...");
    setErrorMessage(null);
    setQuizMode(params.mode);

    try {
      const stageTimer1 = setTimeout(() => {
        setLoadingStage("Synthesizing multiple choice & open-ended theory prompts...");
      }, 3500);

      const stageTimer2 = setTimeout(() => {
        setLoadingStage("Formulating comprehensive rubric scoring criteria...");
      }, 7000);

      // Automatically fetch previous questions for anti-duplication if not explicitly passed
      const docNames = params.files.map((f) => f.name);
      const excluded = params.excludedQuestions || getPreviousQuestionsForDocuments(docNames);

      const quiz = await generateQuizFromDocuments({
        files: params.files,
        mcqCount: params.mcqCount,
        theoryCount: params.theoryCount,
        difficulty: params.difficulty,
        studyFocus: params.studyFocus,
        excludedQuestions: excluded,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      setActiveQuiz(quiz);
      setCurrentView("quiz");
      setNoticeMessage(
        quiz.warnings && quiz.warnings.length > 0
          ? `Note: ${quiz.warnings.join(" ")} Questions cover only the first part of the truncated document(s).`
          : null
      );
    } catch (err: any) {
      console.error("Quiz generation error:", err);
      setErrorMessage(
        err?.message || "Failed to generate quiz. Please check your Gemini API key and document format."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMoreQuestions = () => {
    if (!activeAttempt && !activeQuiz) return;
    const targetQuiz = activeAttempt?.quiz || activeQuiz;
    if (!targetQuiz) return;

    // If documents payload is available in the quiz, regenerate directly with 0 repetition!
    if (targetQuiz.documents && targetQuiz.documents.length > 0) {
      const excluded = getPreviousQuestionsForDocuments(targetQuiz.documentNames);
      handleGenerateQuiz({
        files: targetQuiz.documents,
        mcqCount: targetQuiz.mcqCount || 5,
        theoryCount: targetQuiz.theoryCount || 2,
        difficulty: targetQuiz.difficulty || "medium",
        studyFocus: "",
        mode: quizMode,
        excludedQuestions: excluded,
      });
    } else {
      // Return to create view with current document state
      setCurrentView("create");
    }
  };

  const handleSubmitQuiz = async (
    userAnswers: Record<string, UserAnswer>,
    timeTakenSeconds: number
  ) => {
    if (!activeQuiz) return;

    setIsLoading(true);
    setLoadingStage("Evaluating submitted assessment and running AI theory grading...");

    try {
      const finalAnswers: Record<string, UserAnswer> = { ...userAnswers };
      let mcqCorrect = 0;
      let mcqTotal = 0;
      let theoryEarnedPoints = 0;
      let theoryTotalPoints = 0;

      // Grade MCQs and Theory questions
      for (const q of activeQuiz.questions) {
        const ans: UserAnswer = finalAnswers[q.id] || { questionId: q.id };

        if (q.type === "mcq") {
          mcqTotal += 1;
          const isCorrect = ans.selectedOptionIndex === q.correctAnswerIndex;
          if (isCorrect) mcqCorrect += 1;
          finalAnswers[q.id] = {
            ...ans,
            isCorrect,
          };
        } else if (q.type === "theory") {
          const maxScore = q.maxPoints || 5;
          theoryTotalPoints += maxScore;

          const textAnswer = (ans.textAnswer || "").trim();
          if (textAnswer) {
            try {
              setLoadingStage(`Grading Theory Question: "${q.question.slice(0, 30)}..."`);
              const evalResult = await evaluateTheoryAnswer({
                question: q.question,
                userAnswer: textAnswer,
                modelAnswer: q.modelAnswer,
                rubric: q.theoryRubric || [],
                maxScore,
              });

              theoryEarnedPoints += evalResult.score;
              finalAnswers[q.id] = {
                ...ans,
                theoryEvaluation: evalResult,
              };
            } catch (evalErr) {
              console.error("Theory evaluation error for q:", q.id, evalErr);
              finalAnswers[q.id] = {
                ...ans,
                theoryEvaluation: {
                  questionId: q.id,
                  score: Math.round(maxScore * 0.5),
                  maxScore,
                  percentage: 50,
                  feedback: "Self-evaluated. Review the exemplary model answer below.",
                  keyPointsAddressed: ["Response submitted for review"],
                  missingKeyPoints: [],
                  improvementTips: ["Compare with model answer for complete mastery"],
                },
              };
              theoryEarnedPoints += Math.round(maxScore * 0.5);
            }
          } else {
            // Unanswered theory question
            finalAnswers[q.id] = {
              ...ans,
              theoryEvaluation: {
                questionId: q.id,
                score: 0,
                maxScore,
                percentage: 0,
                feedback: "No answer provided for this theory question.",
                keyPointsAddressed: [],
                missingKeyPoints: q.theoryRubric || ["Core concept omitted"],
                improvementTips: ["Review the model answer to understand key requirements"],
              },
            };
          }
        }
      }

      // Calculate Total Score Percentage
      const totalPossible = mcqTotal + theoryTotalPoints;
      const totalEarned = mcqCorrect + theoryEarnedPoints;
      const overallPercentage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;

      let ratingGrade: "Mastered" | "Proficient" | "Competent" | "Needs Review" = "Needs Review";
      if (overallPercentage >= 85) ratingGrade = "Mastered";
      else if (overallPercentage >= 70) ratingGrade = "Proficient";
      else if (overallPercentage >= 50) ratingGrade = "Competent";

      const attempt: QuizAttempt = {
        id: `attempt-${Date.now()}`,
        quizId: activeQuiz.id,
        quizTitle: activeQuiz.title,
        timestamp: new Date().toISOString(),
        timeTakenSeconds,
        totalQuestions: activeQuiz.questions.length,
        mcqCorrect,
        mcqTotal,
        theoryEarnedPoints,
        theoryTotalPoints,
        overallPercentage,
        ratingGrade,
        answers: finalAnswers,
        quiz: activeQuiz,
      };

      // Save locally
      if (preferences.autoSaveToVault !== false) {
        saveStoredAttempt(attempt);
        handleRefreshVault();
      }

      setActiveAttempt(attempt);
      setCurrentView("results");
    } catch (err: any) {
      console.error("Submission evaluation error:", err);
      setErrorMessage(err?.message || "Failed to finalize evaluation.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetakeAll = () => {
    if (!activeQuiz) return;
    setCurrentView("quiz");
  };

  const handleRetakeMissed = (missedQuestions: Question[]) => {
    if (!activeQuiz || missedQuestions.length === 0) return;

    const missedQuiz: Quiz = {
      ...activeQuiz,
      id: `quiz-missed-${Date.now()}`,
      title: `${activeQuiz.title} (Targeted Remediation)`,
      totalQuestions: missedQuestions.length,
      mcqCount: missedQuestions.filter((q) => q.type === "mcq").length,
      theoryCount: missedQuestions.filter((q) => q.type === "theory").length,
      questions: missedQuestions,
    };

    setActiveQuiz(missedQuiz);
    setCurrentView("quiz");
  };

  const handleSelectPastAttempt = (attempt: QuizAttempt) => {
    setActiveQuiz(attempt.quiz);
    setActiveAttempt(attempt);
    setCurrentView("results");
  };

  const handleRetakePastAttempt = (attempt: QuizAttempt) => {
    setActiveQuiz(attempt.quiz);
    setCurrentView("quiz");
  };

  const handleDeleteAttempt = (id: string) => {
    deleteStoredAttempt(id);
    handleRefreshVault();
  };

  const handleOpenTutorForQuestion = (q: Question) => {
    setTutorQuestion(q);
    setIsTutorOpen(true);
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark
          ? "bg-[#09090b] text-[#f4f4f5]"
          : "bg-zinc-50 text-zinc-900"
      }`}
    >
      {/* Navigation Header */}
      <Header
        preferences={preferences}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewQuiz={() => {
          setActiveQuiz(null);
          setActiveAttempt(null);
          setCurrentView("create");
        }}
        historyCount={attempts.length}
        currentView={currentView}
        onToggleTheme={(newTheme) => handleSavePreferences({ theme: newTheme })}
        onThemeChange={(newTheme) => handleSavePreferences({ theme: newTheme })}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-2.5 sm:px-4 py-4 sm:py-8 overflow-x-hidden">
        {/* Global Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
              className={`border rounded-2xl p-7 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in fade-in duration-150 ${
                isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200"
              }`}
            >
              <div
                className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center font-bold ${
                  isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                <Loader2 className="w-6 h-6 animate-spin text-red-600" />
              </div>

              <div className="space-y-1">
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                  Synthesizing Assessment
                </h3>
                <p className={`text-xs font-mono leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {loadingStage}
                </p>
              </div>

              <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                <div className="bg-red-600 h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          </div>
        )}

        {/* Truncation Notice Banner */}
        {noticeMessage && currentView === "quiz" && (
          <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start justify-between gap-3">
            <span>{noticeMessage}</span>
            <button onClick={() => setNoticeMessage(null)} className="shrink-0 font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 text-xs underline font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Routing */}
        {currentView === "create" && (
          <UploadConfigStep
            preferences={preferences}
            onGenerateQuiz={handleGenerateQuiz}
            isLoading={isLoading}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {currentView === "quiz" && activeQuiz && (
          <QuizPlayer
            quiz={activeQuiz}
            mode={quizMode}
            theme={currentTheme}
            onSubmitQuiz={handleSubmitQuiz}
            onCancelQuiz={() => setCurrentView("create")}
          />
        )}

        {currentView === "results" && activeAttempt && (
          <QuizResults
            attempt={activeAttempt}
            theme={currentTheme}
            onRetakeAll={handleRetakeAll}
            onRetakeMissed={handleRetakeMissed}
            onNewQuiz={() => {
              setActiveQuiz(null);
              setActiveAttempt(null);
              setCurrentView("create");
            }}
            onAskTutor={handleOpenTutorForQuestion}
            onGenerateMoreQuestions={handleGenerateMoreQuestions}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <SetupWizard
        isOpen={isWizardOpen}
        preferences={preferences}
        theme={currentTheme}
        onSavePreferences={handleSavePreferences}
        onClose={() => setIsWizardOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        preferences={preferences}
        theme={currentTheme}
        onSavePreferences={handleSavePreferences}
        onClose={() => setIsSettingsOpen(false)}
        onRefreshVault={handleRefreshVault}
      />

      <HistoryVault
        isOpen={isHistoryOpen}
        attempts={attempts}
        theme={currentTheme}
        onClose={() => setIsHistoryOpen(false)}
        onSelectAttempt={handleSelectPastAttempt}
        onDeleteAttempt={handleDeleteAttempt}
        onRefreshVault={handleRefreshVault}
        onRetakeAttempt={handleRetakePastAttempt}
      />

      <AskTutorDrawer
        isOpen={isTutorOpen}
        question={tutorQuestion}
        theme={currentTheme}
        onClose={() => {
          setIsTutorOpen(false);
          setTutorQuestion(null);
        }}
      />
    </div>
  );
}
