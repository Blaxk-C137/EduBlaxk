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
  LayoutGrid,
  X,
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
  const currentQuestion: Question = quiz.questions[currentIndex];
  const currentAnswer = answers[currentQuestion.id] || { questionId: currentQuestion.id };
  const totalQuestions = quiz.questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const surface = isDark
    ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
    : "bg-white border-zinc-200 text-zinc-900";
  const inset = isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200";

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeSpent((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Keyboard navigation for MCQs (A/B/C/D or 1/2/3/4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === "Escape") {
        if (showPalette) setShowPalette(false);
        else if (showConfirmSubmit) setShowConfirmSubmit(false);
        return;
      }

      // While a sheet is open, keys belong to the sheet, not the question behind it.
      if (showPalette || showConfirmSubmit) return;

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

      if (e.key === "ArrowRight" && currentIndex < totalQuestions - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, currentQuestion, answers, showPalette, showConfirmSubmit, totalQuestions]);

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

  const navButton = `flex items-center justify-center gap-1.5 h-11 shrink-0 rounded-xl border transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
    isDark
      ? "bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200"
      : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-700 shadow-xs"
  }`;
  const navButtonSquare = `${navButton} w-11`;
  const navButtonFlagged = "bg-amber-500/15 border-amber-400 text-amber-500 hover:bg-amber-500/25";

  return (
    /* Full-height shell: only the question column scrolls, the dock never moves. */
    <div className="h-full flex flex-col min-h-0">
      {/* ── Top bar: where you are ─────────────────────────────────────── */}
      <div className={`shrink-0 border-b ${isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200"}`}>
        <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 h-12 flex items-center justify-between gap-2">
          <button
            onClick={onCancelQuiz}
            className={`flex items-center gap-0.5 h-9 pl-1 pr-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Exit</span>
          </button>

          <span className={`font-mono text-xs font-bold tabular-nums shrink-0 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
            {currentIndex + 1} <span className="opacity-40">/</span> {totalQuestions}
          </span>

          <span
            className={`text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap shrink-0 ${
              currentQuestion.type === "theory"
                ? isDark
                  ? "bg-purple-950/50 text-purple-300 border-purple-800"
                  : "bg-purple-50 text-purple-700 border-purple-200"
                : isDark
                ? "bg-red-950/50 text-red-400 border-red-800/80"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {currentQuestion.type === "theory" ? "Theory" : "Multiple choice"}
          </span>
        </div>

        {/* Progress sits on the bar's own edge rather than taking a row of its own. */}
        <div className={`h-0.5 w-full ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
          <div
            className="bg-red-600 h-full transition-all duration-200"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Scrolling question column ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 py-4 space-y-4">
          <div className={`border rounded-2xl p-4 sm:p-6 space-y-5 ${surface} ${isDark ? "" : "shadow-sm"}`}>
            {/* Topic & difficulty */}
            <div className={`flex items-center justify-between gap-2 flex-wrap border-b pb-3 ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <span className={`text-xs font-mono font-semibold min-w-0 truncate ${isDark ? "text-red-400" : "text-red-600"}`}>
                {currentQuestion.topic || "Academic assessment"}
              </span>
              {currentQuestion.difficulty && (
                <span className={`text-[11px] font-mono capitalize px-2 py-0.5 rounded shrink-0 ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
                  {currentQuestion.difficulty}
                </span>
              )}
            </div>

            <h2 className={`text-base sm:text-lg font-bold leading-relaxed ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {currentQuestion.question}
            </h2>

            {/* Options for MCQ */}
            {currentQuestion.type === "mcq" ? (
              <div className="space-y-2.5">
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
                      style = isDark
                        ? "border-emerald-600 bg-emerald-950/40 text-emerald-200 font-medium ring-1 ring-emerald-500/30"
                        : "border-emerald-500 bg-emerald-50 text-emerald-950 font-medium ring-1 ring-emerald-500/30";
                    } else if (isSelected && !isCorrect) {
                      style = isDark
                        ? "border-rose-800 bg-rose-950/40 text-rose-300 line-through opacity-80"
                        : "border-rose-400 bg-rose-50 text-rose-950 line-through opacity-80";
                    }
                  }

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(optIdx)}
                      className={`w-full text-left p-3 sm:p-3.5 rounded-xl border flex items-start gap-3 transition-all cursor-pointer min-h-[52px] ${style}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-colors ${
                          isSelected
                            ? "bg-red-600 border-red-600 text-white"
                            : isDark
                            ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                            : "bg-zinc-100 border-zinc-200 text-zinc-700"
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="text-sm leading-relaxed pt-0.5 flex-1 min-w-0">{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Theory question */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Your answer</span>
                  <span className={`font-mono ${isDark ? "text-red-400" : "text-red-600"}`}>
                    {(currentAnswer.textAnswer || "").split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                <textarea
                  id="input-theory-answer"
                  rows={6}
                  value={currentAnswer.textAnswer || ""}
                  onChange={(e) => handleTheoryTextChange(e.target.value)}
                  placeholder="Write a full response — definitions, key mechanisms, worked steps, examples."
                  className={`w-full border rounded-xl p-3.5 text-sm leading-relaxed outline-none resize-y transition-colors min-h-[150px] ${
                    isDark
                      ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                      : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
                  }`}
                />

                {(currentQuestion as TheoryQuestion).theoryRubric && (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${inset}`}>
                    <span className={`font-bold flex items-center gap-1.5 ${isDark ? "text-red-400" : "text-red-600"}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Graded against
                    </span>
                    <ul className={`list-disc list-inside space-y-1 pl-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {(currentQuestion as TheoryQuestion).theoryRubric.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Practice mode: instant check */}
            {mode === "practice" && (
              <div className={`pt-4 border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                {!revealedInPractice[currentQuestion.id] ? (
                  <button
                    type="button"
                    onClick={handleRevealPractice}
                    className={`w-full sm:w-auto text-xs font-semibold flex items-center justify-center gap-1.5 px-3.5 py-3 min-h-[44px] rounded-xl border transition-colors cursor-pointer ${
                      isDark
                        ? "bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/60"
                        : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Reveal answer & explanation</span>
                  </button>
                ) : (
                  <div className={`p-4 rounded-xl border space-y-2 ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-red-50/50 border-red-200"}`}>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span>Why this is the answer</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      {currentQuestion.explanation}
                    </p>
                    {currentQuestion.sourceContext && (
                      <p className={`text-xs italic pt-2 border-t ${isDark ? "border-zinc-800 text-zinc-400" : "border-red-200/70 text-zinc-600"}`}>
                        From your document: “{currentQuestion.sourceContext}”
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Docked controls: always reachable, never scroll away ───────── */}
      <div
        className={`shrink-0 border-t pb-[env(safe-area-inset-bottom)] ${
          isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]"
        }`}
      >
        <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <button
            id="btn-prev-question"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            aria-label="Previous question"
            className={navButtonSquare}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Clock reads alone here — the answered tally lives on the matrix
              button so the two never fight for width on a narrow dock. The
              clock glyph is the first thing to go on a 360px screen. */}
          <div
            className={`flex-1 min-w-0 sm:flex-none h-11 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 font-mono text-xs font-semibold whitespace-nowrap ${
              isDark ? "bg-[#09090b] border-zinc-800 text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-700"
            }`}
          >
            <Clock className="hidden sm:block w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="tabular-nums">{formatTime(timeSpent)}</span>
          </div>

          <button
            id="btn-flag-question"
            onClick={handleToggleFlag}
            aria-label={currentAnswer?.flaggedForReview ? "Remove flag" : "Flag for review"}
            className={`${navButtonSquare} ${currentAnswer?.flaggedForReview ? navButtonFlagged : ""}`}
          >
            <Flag className={`w-4 h-4 ${currentAnswer?.flaggedForReview ? "fill-amber-500 text-amber-500" : ""}`} />
          </button>

          <button
            id="btn-open-palette"
            onClick={() => setShowPalette(true)}
            aria-label={`Open question matrix, ${answeredCount} of ${totalQuestions} answered`}
            className={`${navButton} relative min-w-11 px-2.5`}
          >
            <LayoutGrid className="w-4 h-4 text-red-600 shrink-0" />
            <span className={`font-mono text-[11px] font-semibold tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              {answeredCount}/{totalQuestions}
            </span>
            {answeredCount === totalQuestions && (
              <span
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 ${
                  isDark ? "border-[#121215]" : "border-white"
                }`}
              />
            )}
          </button>

          {isLastQuestion ? (
            <button
              id="btn-finish-quiz"
              onClick={() => setShowConfirmSubmit(true)}
              className="ml-auto flex items-center justify-center gap-1.5 h-11 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Submit</span>
            </button>
          ) : (
            <button
              id="btn-next-question"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              className="ml-auto flex items-center justify-center gap-1.5 h-11 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* ── Question matrix — bottom sheet, never reflows the page ─────── */}
      {showPalette && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPalette(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Question matrix"
            className={`sheet-up w-full sm:max-w-3xl mx-auto rounded-t-3xl sm:rounded-2xl border-t sm:border sm:mb-6 max-h-[75dvh] flex flex-col overflow-hidden ${
              isDark ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]" : "bg-white border-zinc-200 text-zinc-900"
            }`}
          >
            <div className={`px-4 py-3 border-b flex items-start justify-between gap-3 ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">Jump to a question</h3>
                <div className={`flex items-center gap-3 text-[11px] mt-1.5 flex-wrap ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-red-600 inline-block" /> Answered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded border inline-block ${isDark ? "border-zinc-600" : "border-zinc-400"}`} /> Unanswered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Flagged
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowPalette(false)}
                aria-label="Close question matrix"
                className={`w-9 h-9 -mr-1 -mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-6 xs:grid-cols-8 sm:grid-cols-10 gap-2">
                {quiz.questions.map((q, idx) => {
                  const ans = answers[q.id];
                  const isAnswered =
                    q.type === "mcq" ? typeof ans?.selectedOptionIndex === "number" : Boolean(ans?.textAnswer?.trim());
                  const isFlagged = ans?.flaggedForReview;
                  const isCurrent = idx === currentIndex;

                  let style = isDark
                    ? "border-zinc-800 bg-[#09090b] text-zinc-400 hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100";

                  if (isCurrent) {
                    style = "border-red-600 bg-red-600 text-white font-bold";
                  } else if (isFlagged) {
                    style = isDark
                      ? "border-amber-500 bg-amber-500/20 text-amber-400 font-semibold"
                      : "border-amber-400 bg-amber-50 text-amber-700 font-semibold";
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
                      className={`h-11 text-xs font-mono rounded-xl border transition-colors cursor-pointer ${style}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              {isLastQuestion ? (
                <button
                  onClick={() => {
                    setShowPalette(false);
                    setShowConfirmSubmit(true);
                  }}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Submit assessment
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1));
                    setShowPalette(false);
                  }}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Next question
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Submit confirmation ────────────────────────────────────────── */}
      {showConfirmSubmit && (
        <div
          id="confirm-submit-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirmSubmit(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`sheet-up w-full max-w-sm border rounded-2xl p-5 shadow-2xl space-y-4 ${surface}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 border border-red-200 text-red-600"
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold">Submit assessment?</h3>
                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {answeredCount} of {totalQuestions} answered
                </p>
              </div>
            </div>

            {answeredCount < totalQuestions && (
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                {totalQuestions - answeredCount} question
                {totalQuestions - answeredCount === 1 ? " is" : "s are"} still blank. Blank answers score zero.
              </div>
            )}

            <div className={`grid grid-cols-2 gap-2 pt-3 border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className={`h-11 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Keep answering
              </button>
              <button
                id="btn-confirm-submit-quiz"
                type="button"
                onClick={handleFinalSubmit}
                className="h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Submit & grade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
