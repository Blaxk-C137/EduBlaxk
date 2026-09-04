import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  CheckCircle2,
  Clock,
  HelpCircle,
  BookOpen,
  AlertTriangle,
  Grid,
} from "lucide-react";
import { Quiz, Question, UserAnswer, MCQQuestion, TheoryQuestion, AppTheme } from "../types";

interface QuizPlayerProps {
  quiz: Quiz;
  mode: "practice" | "exam";
  theme?: AppTheme;
  onSubmitQuiz: (answers: Record<string, UserAnswer>, timeTakenSeconds: number) => void;
  onCancelQuiz: () => void;
}

export const QuizPlayer: React.FC<QuizPlayerProps> = ({
  quiz,
  mode,
  theme = "red-light",
  onSubmitQuiz,
  onCancelQuiz,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({});
  const [revealedInPractice, setRevealedInPractice] = useState<Record<string, boolean>>({});
  const [timeSpent, setTimeSpent] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;
  const currentQuestion: Question = quiz.questions[currentIndex];
  const currentAnswer = answers[currentQuestion.id] || { questionId: currentQuestion.id };

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeSpent((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard navigation for MCQs (A/B/C/D or 1/2/3/4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (currentQuestion.type === "mcq") {
        const key = e.key.toUpperCase();
        let selectedIdx = -1;
        if (key === "A" || key === "1") selectedIdx = 0;
        if (key === "B" || key === "2") selectedIdx = 1;
        if (key === "C" || key === "3") selectedIdx = 2;
        if (key === "D" || key === "4") selectedIdx = 3;

        if (selectedIdx >= 0 && selectedIdx < (currentQuestion as MCQQuestion).options.length) {
          handleSelectOption(selectedIdx);
        }
      }

      if (e.key === "ArrowRight" && currentIndex < quiz.questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, currentQuestion, answers]);

  const handleSelectOption = (index: number) => {
    if (currentQuestion.type !== "mcq") return;
    const isCorrect = index === (currentQuestion as MCQQuestion).correctAnswerIndex;

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        selectedOptionIndex: index,
        isCorrect,
      },
    }));
  };

  const handleTheoryTextChange = (text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        textAnswer: text,
      },
    }));
  };

  const handleToggleFlag = () => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        flaggedForReview: !prev[currentQuestion.id]?.flaggedForReview,
      },
    }));
  };

  const handleRevealPractice = () => {
    setRevealedInPractice((prev) => ({
      ...prev,
      [currentQuestion.id]: true,
    }));
  };

  const answeredCount = (Object.values(answers) as UserAnswer[]).filter((a: UserAnswer) => {
    const q = quiz.questions.find((item) => item.id === a.questionId);
    if (!q) return false;
    if (q.type === "mcq") return typeof a.selectedOptionIndex === "number";
    if (q.type === "theory") return (a.textAnswer || "").trim().length > 0;
    return false;
  }).length;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleFinalSubmit = () => {
    setShowConfirmSubmit(false);
    onSubmitQuiz(answers, timeSpent);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 px-2 sm:px-0 overflow-hidden">
      {/* Top Bar: Progress & Status */}
      <div
        className={`border rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 shadow-xs text-zinc-900"
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-start flex-wrap">
          <button
            onClick={onCancelQuiz}
            className={`text-xs font-semibold px-2.5 py-1.5 min-h-[34px] rounded-lg transition-colors cursor-pointer shrink-0 ${
              isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            &larr; Exit
          </button>
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block shrink-0" />
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className={`text-xs font-bold font-mono whitespace-nowrap ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              Q {currentIndex + 1} of {quiz.questions.length}
            </span>
            <span
              className={`text-[9px] sm:text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${
                currentQuestion.type === "theory"
                  ? isDark
                    ? "bg-purple-950/50 text-purple-300 border-purple-800"
                    : "bg-purple-50 text-purple-700 border-purple-200"
                  : isDark
                  ? "bg-red-950/50 text-red-400 border-red-800/80"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {currentQuestion.type === "theory" ? "Theory & Rubric" : "Multiple Choice"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end shrink-0">
          {/* Timer */}
          <div
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[34px] sm:min-h-[36px] rounded-xl border font-mono text-xs font-semibold shrink-0 ${
              isDark
                ? "bg-[#09090b] border-zinc-800 text-zinc-200"
                : "bg-zinc-50 border-zinc-200 text-zinc-700"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="text-xs">{formatTime(timeSpent)}</span>
          </div>

          {/* Flag */}
          <button
            id="btn-flag-question"
            onClick={handleToggleFlag}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[34px] sm:min-h-[36px] rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              currentAnswer?.flaggedForReview
                ? "bg-amber-500/15 border-amber-400 text-amber-500 shadow-xs"
                : isDark
                ? "bg-[#09090b] border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Flag
              className={`w-3.5 h-3.5 shrink-0 ${
                currentAnswer?.flaggedForReview ? "fill-amber-500 text-amber-500" : ""
              }`}
            />
            <span className="hidden sm:inline">Flag</span>
          </button>

          {/* Question Grid Trigger */}
          <button
            id="btn-open-palette"
            onClick={() => setShowPalette(!showPalette)}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 min-h-[34px] sm:min-h-[36px] rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              isDark
                ? "bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-xs"
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="text-xs">
              <span className="hidden xs:inline">Matrix </span>({answeredCount}/{quiz.questions.length})
            </span>
          </button>
        </div>
      </div>

      {/* Progress Line */}
      <div className={`w-full ${isDark ? "bg-zinc-800" : "bg-zinc-200"} h-1.5 rounded-full overflow-hidden`}>
        <div
          className="bg-red-600 h-full transition-all duration-200 rounded-full"
          style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
        />
      </div>

      {/* Question Palette Drawer/Overlay */}
      {showPalette && (
        <div
          className={`border rounded-2xl p-4 sm:p-5 space-y-3.5 animate-in fade-in duration-150 ${
            isDark
              ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
              : "bg-white border-zinc-200 shadow-sm text-zinc-900"
          }`}
        >
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <span className={`font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              Question Matrix & Quick Navigation
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-600 inline-block" /> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded border border-zinc-400 inline-block" /> Unanswered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Flagged
              </span>
            </div>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
            {quiz.questions.map((q, idx) => {
              const ans = answers[q.id];
              const isAnswered =
                q.type === "mcq"
                  ? typeof ans?.selectedOptionIndex === "number"
                  : Boolean(ans?.textAnswer?.trim());
              const isFlagged = ans?.flaggedForReview;
              const isCurrent = idx === currentIndex;

              let style = isDark
                ? "border-zinc-800 bg-[#09090b] text-zinc-400 hover:bg-zinc-800"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100";

              if (isCurrent) {
                style = "border-red-600 bg-red-600 text-white font-bold shadow-xs";
              } else if (isFlagged) {
                style = "border-amber-400 bg-amber-500/20 text-amber-400 font-semibold";
              } else if (isAnswered) {
                style = isDark
                  ? "border-red-800 bg-red-950/60 text-red-300 font-semibold"
                  : "border-red-200 bg-red-50 text-red-800 font-semibold";
              }

              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setShowPalette(false);
                  }}
                  className={`py-2 text-xs font-mono rounded-lg border transition-all cursor-pointer min-h-[36px] ${style}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Question Card */}
      <div
        className={`border rounded-2xl p-4 sm:p-8 space-y-5 sm:space-y-6 transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 shadow-sm text-zinc-900"
        }`}
      >
        {/* Question Header & Prompt */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b pb-3 border-inherit gap-2 flex-wrap">
            <span className={`text-xs font-mono font-semibold truncate ${isDark ? "text-red-400" : "text-red-600"}`}>
              {currentQuestion.topic || "Academic Assessment"}
            </span>
            {currentQuestion.difficulty && (
              <span
                className={`text-[10px] sm:text-[11px] font-mono capitalize px-2 py-0.5 rounded shrink-0 ${
                  isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {currentQuestion.difficulty} Level
              </span>
            )}
          </div>

          <h2
            className={`text-base sm:text-xl font-bold leading-relaxed break-words ${
              isDark ? "text-zinc-100" : "text-zinc-900"
            }`}
          >
            {currentQuestion.question}
          </h2>
        </div>

        {/* Options for MCQ */}
        {currentQuestion.type === "mcq" ? (
          <div className="space-y-2.5 sm:space-y-3">
            {(currentQuestion as MCQQuestion).options.map((option, optIdx) => {
              const isSelected = currentAnswer.selectedOptionIndex === optIdx;
              const isRevealed = Boolean(revealedInPractice[currentQuestion.id]);
              const isCorrect = (currentQuestion as MCQQuestion).correctAnswerIndex === optIdx;

              let style = isDark
                ? "border-zinc-800 bg-[#09090b] hover:border-zinc-700 hover:bg-zinc-900 text-zinc-200"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 text-zinc-800";

              if (isSelected) {
                style = isDark
                  ? "border-red-500 bg-red-950/40 text-white font-medium ring-1 ring-red-500/40"
                  : "border-red-600 bg-red-50/70 text-zinc-950 font-medium ring-1 ring-red-600/30";
              }

              if (isRevealed) {
                if (isCorrect) {
                  style = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 font-medium ring-1 ring-emerald-500/30";
                } else if (isSelected && !isCorrect) {
                  style = "border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-950 dark:text-rose-200 line-through opacity-80";
                }
              }

              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => handleSelectOption(optIdx)}
                  className={`w-full text-left p-3 sm:p-4 rounded-xl border flex items-start gap-2.5 sm:gap-3 transition-all cursor-pointer min-h-[48px] ${style}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                      isSelected
                        ? "bg-red-600 border-red-600 text-white shadow-xs"
                        : isDark
                        ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                        : "bg-zinc-100 border-zinc-200 text-zinc-700"
                    }`}
                  >
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <span className="text-xs sm:text-sm leading-relaxed pt-0.5 flex-1 min-w-0 break-words">
                    {option}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Theory Question View */
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Your Detailed Explanation / Solution
              </span>
              <span className={`font-mono text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>
                {(currentAnswer.textAnswer || "").split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            <textarea
              id="input-theory-answer"
              rows={6}
              value={currentAnswer.textAnswer || ""}
              onChange={(e) => handleTheoryTextChange(e.target.value)}
              placeholder="Provide a comprehensive academic response. Include definitions, key mechanisms, and relevant examples..."
              className={`w-full border rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed outline-none resize-y transition-colors font-sans min-h-[140px] ${
                isDark
                  ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                  : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
              }`}
            />

            {(currentQuestion as TheoryQuestion).theoryRubric && (
              <div
                className={`p-3.5 sm:p-4 rounded-xl border text-xs space-y-2 ${
                  isDark ? "bg-[#09090b] border-zinc-800 text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                }`}
              >
                <span className={`font-bold flex items-center gap-1.5 ${isDark ? "text-red-400" : "text-red-600"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Rubric Criteria Evaluated:
                </span>
                <ul className="list-disc list-inside space-y-1 text-xs opacity-90 pl-1">
                  {(currentQuestion as TheoryQuestion).theoryRubric.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Practice Mode: Instant Check Answer Button & Explanation */}
        {mode === "practice" && (
          <div className="pt-3 border-t border-inherit space-y-3">
            {!revealedInPractice[currentQuestion.id] ? (
              <button
                type="button"
                onClick={handleRevealPractice}
                className={`text-xs font-semibold flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? "bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/60"
                    : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                }`}
              >
                <HelpCircle className="w-4 h-4 text-red-600" />
                <span>Reveal Concept Key & Model Explanation</span>
              </button>
            ) : (
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  isDark ? "bg-[#09090b] border-zinc-800 text-zinc-200" : "bg-red-50/50 border-red-200 text-zinc-800"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                  <BookOpen className="w-4 h-4" />
                  <span>Curriculum Reference & Explanation:</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  {currentQuestion.explanation}
                </p>
                {currentQuestion.sourceContext && (
                  <div className="text-xs italic pt-1.5 border-t border-inherit opacity-75">
                    Excerpt: "{currentQuestion.sourceContext}"
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 sm:pt-5 border-t border-inherit gap-3">
          <button
            id="btn-prev-question"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[44px] disabled:opacity-40 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              isDark
                ? "bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-700 shadow-xs"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {currentIndex === quiz.questions.length - 1 ? (
            <button
              id="btn-finish-quiz"
              onClick={() => setShowConfirmSubmit(true)}
              className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Submit Assessment</span>
            </button>
          ) : (
            <button
              id="btn-next-question"
              onClick={() => setCurrentIndex((prev) => Math.min(quiz.questions.length - 1, prev + 1))}
              className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal - Discard by clicking backdrop */}
      {showConfirmSubmit && (
        <div
          id="confirm-submit-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirmSubmit(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className={`w-full max-w-md border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 ${
              isDark ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]" : "bg-white border-zinc-200 text-zinc-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 border border-red-200 text-red-600"}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Submit Assessment?</h3>
                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {answeredCount} of {quiz.questions.length} questions completed
                </p>
              </div>
            </div>

            {answeredCount < quiz.questions.length && (
              <div className={`p-3.5 rounded-xl border text-xs ${isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                You have {quiz.questions.length - answeredCount} unanswered question(s). You can still proceed to grade.
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-inherit">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className={`px-4 py-2 min-h-[40px] text-xs font-semibold rounded-lg transition cursor-pointer ${
                  isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Return to Test
              </button>
              <button
                id="btn-confirm-submit-quiz"
                type="button"
                onClick={handleFinalSubmit}
                className="px-5 py-2 min-h-[40px] bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
              >
                Confirm & Grade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
