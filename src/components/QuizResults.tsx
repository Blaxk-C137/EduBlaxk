import React, { useState } from "react";
import {
  RotateCcw,
  Download,
  Printer,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  ShieldCheck,
  PlusCircle,
} from "lucide-react";
import { QuizAttempt, Question, MCQQuestion, TheoryQuestion, AppTheme } from "../types";
import { printAttemptReport, exportQuestionBankJSON } from "../lib/storage";

interface QuizResultsProps {
  attempt: QuizAttempt;
  theme?: AppTheme;
  onRetakeAll: () => void;
  onRetakeMissed: (missedQuestions: Question[]) => void;
  onNewQuiz: () => void;
  onAskTutor: (question: Question) => void;
  onGenerateMoreQuestions?: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  attempt,
  theme = "red-light",
  onRetakeAll,
  onRetakeMissed,
  onNewQuiz,
  onAskTutor,
  onGenerateMoreQuestions,
}) => {
  const [filter, setFilter] = useState<"all" | "incorrect" | "theory">("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;

  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const missedQuestions = attempt.quiz.questions.filter((q) => {
    const ans = attempt.answers[q.id];
    if (q.type === "mcq") {
      return !ans?.isCorrect;
    }
    if (q.type === "theory") {
      return (ans?.theoryEvaluation?.percentage ?? 0) < 70;
    }
    return false;
  });

  const filteredQuestions = attempt.quiz.questions.filter((q) => {
    const ans = attempt.answers[q.id];
    if (filter === "incorrect") {
      if (q.type === "mcq") return !ans?.isCorrect;
      if (q.type === "theory") return (ans?.theoryEvaluation?.percentage ?? 0) < 70;
    }
    if (filter === "theory") return q.type === "theory";
    return true;
  });

  const getRatingBadge = (rating: string) => {
    switch (rating) {
      case "Mastered":
        return isDark ? "bg-emerald-950/60 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800";
      case "Proficient":
        return isDark ? "bg-red-950/60 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-800";
      case "Competent":
        return isDark ? "bg-amber-950/60 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800";
      default:
        return isDark ? "bg-rose-950/60 border-rose-800 text-rose-300" : "bg-rose-50 border-rose-200 text-rose-800";
    }
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(attempt, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edublaxk_report_${attempt.quizTitle.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 sm:space-y-6 px-2 sm:px-0 overflow-hidden">
      {/* Assessment Summary Card */}
      <div
        className={`border rounded-2xl p-4 sm:p-8 space-y-5 sm:space-y-6 transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a]"
            : "bg-white border-zinc-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          {/* Left: Rating & Title */}
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border shrink-0 ${getRatingBadge(attempt.ratingGrade)}`}>
                Rating: {attempt.ratingGrade}
              </span>
              {attempt.quiz.modelUsed && (
                <span
                  className={`text-[10px] sm:text-[11px] font-mono font-medium px-2 py-0.5 rounded border truncate max-w-[200px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-300" : "bg-zinc-100 border-zinc-200 text-zinc-700"
                  }`}
                >
                  Engine: {attempt.quiz.modelUsed}
                </span>
              )}
              <span className={`text-[10px] sm:text-[11px] font-mono shrink-0 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {new Date(attempt.timestamp).toLocaleDateString()}
              </span>
            </div>

            <h1 className={`text-xl sm:text-3xl font-bold tracking-tight break-words ${isDark ? "text-[#f4f4f5]" : "text-zinc-900"}`}>
              {attempt.quizTitle}
            </h1>

            <p className={`text-xs max-w-xl leading-relaxed break-words ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {attempt.quiz.summary || "Academic performance report indexed and archived in your local EduBLAXK vault."}
            </p>
          </div>

          {/* Right: Score Callout */}
          <div
            className={`flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl border shrink-0 w-full sm:w-auto min-w-[130px] text-center ${
              isDark ? "bg-[#09090b] border-red-900/40" : "bg-red-50/60 border-red-200"
            }`}
          >
            <div className="text-3xl sm:text-5xl font-extrabold font-mono text-red-600 tracking-tight">
              {Math.round(attempt.overallPercentage)}%
            </div>
            <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              Mastery Score
            </div>
          </div>
        </div>

        {/* Detailed Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-4 sm:pt-5 border-t border-inherit">
          <div
            className={`p-3 sm:p-3.5 rounded-xl border text-center ${
              isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className={`text-base sm:text-lg font-bold font-mono truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {attempt.mcqCorrect} / {attempt.mcqTotal}
            </div>
            <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              MCQ Accuracy
            </div>
          </div>

          <div
            className={`p-3 sm:p-3.5 rounded-xl border text-center ${
              isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className={`text-base sm:text-lg font-bold font-mono truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {attempt.theoryEarnedPoints} / {attempt.theoryTotalPoints}
            </div>
            <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Theory Marks
            </div>
          </div>

          <div
            className={`p-3 sm:p-3.5 rounded-xl border text-center ${
              isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className={`text-base sm:text-lg font-bold font-mono truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {Math.floor(attempt.timeTakenSeconds / 60)}m {attempt.timeTakenSeconds % 60}s
            </div>
            <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Time Elapsed
            </div>
          </div>

          <div
            className={`p-3 sm:p-3.5 rounded-xl border text-center ${
              isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className={`text-base sm:text-lg font-bold font-mono capitalize truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {attempt.quiz.difficulty}
            </div>
            <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Rigor Level
            </div>
          </div>
        </div>

        {/* Anti-Duplicate JSON Bank Confirmation Banner */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
            isDark
              ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
              : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="leading-relaxed break-words">
              <span className="font-bold">Indexed to Anti-Duplicate JSON Bank: </span>
              All {attempt.quiz.questions.length} questions from this assessment are saved locally. When you ask for more questions on this PDF, Gemini will skip them to guarantee zero repetitions.
            </div>
          </div>
          <button
            type="button"
            onClick={exportQuestionBankJSON}
            className={`flex items-center gap-1 font-bold underline cursor-pointer shrink-0 text-xs ${
              isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-900"
            }`}
            title="Download complete Question Bank JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Bank JSON</span>
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 border-t border-inherit">
          <div className="flex flex-wrap items-center gap-2">
            {onGenerateMoreQuestions && (
              <button
                id="btn-more-questions"
                type="button"
                onClick={onGenerateMoreQuestions}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[40px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                title="Generate fresh, non-repeating questions on this same document"
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span>More Questions on this PDF</span>
              </button>
            )}

            <button
              id="btn-retake-all"
              type="button"
              onClick={onRetakeAll}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[40px] font-bold text-xs rounded-xl border transition-all cursor-pointer ${
                onGenerateMoreQuestions
                  ? isDark
                    ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
                    : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Retake Test</span>
            </button>

            {missedQuestions.length > 0 && (
              <button
                id="btn-retake-missed"
                type="button"
                onClick={() => onRetakeMissed(missedQuestions)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[40px] font-bold text-xs rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? "bg-red-950/40 hover:bg-red-900/60 text-red-300 border-red-800"
                    : "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Retake Missed ({missedQuestions.length})</span>
              </button>
            )}

            <button
              id="btn-new-test"
              type="button"
              onClick={onNewQuiz}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 min-h-[40px] font-semibold text-xs rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
                  : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
              }`}
            >
              <span>Upload New PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-print-report"
              type="button"
              onClick={() => printAttemptReport(attempt)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2.5 min-h-[40px] font-semibold text-xs rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
                  : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
              }`}
              title="Printable Assessment Report"
            >
              <Printer className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span>Print Sheet</span>
            </button>

            <button
              id="btn-export-attempt-json"
              type="button"
              onClick={handleExportJSON}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2.5 min-h-[40px] font-semibold text-xs rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
                  : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
              }`}
              title="Export Attempt JSON"
            >
              <Download className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Corrections & Review Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className={`text-base font-bold flex items-center gap-2 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              <FileText className="w-4 h-4 text-red-600 shrink-0" />
              <span>Detailed Item Analysis & Solutions</span>
            </h2>
            <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Review answers, rubric evaluations, source context, or ask the tutor.
            </p>
          </div>

          {/* Filter Pills */}
          <div
            className={`flex items-center gap-1 p-1 border rounded-xl overflow-x-auto max-w-full w-full sm:w-auto ${
              isDark ? "bg-[#121215] border-zinc-800" : "bg-white border-zinc-200"
            }`}
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 min-h-[32px] text-xs font-semibold rounded-lg transition cursor-pointer shrink-0 ${
                filter === "all"
                  ? "bg-red-600 text-white shadow-xs"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              All ({attempt.quiz.questions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("incorrect")}
              className={`px-3 py-1.5 min-h-[32px] text-xs font-semibold rounded-lg transition cursor-pointer shrink-0 ${
                filter === "incorrect"
                  ? "bg-red-600 text-white shadow-xs"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Needs Work ({missedQuestions.length})
            </button>
            {attempt.theoryTotalPoints > 0 && (
              <button
                type="button"
                onClick={() => setFilter("theory")}
                className={`px-3 py-1.5 min-h-[32px] text-xs font-semibold rounded-lg transition cursor-pointer shrink-0 ${
                  filter === "theory"
                    ? "bg-red-600 text-white shadow-xs"
                    : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Theory Qs
              </button>
            )}
          </div>
        </div>

        {/* Question Review Cards */}
        <div className="space-y-3.5">
          {filteredQuestions.map((q) => {
            const originalIndex = attempt.quiz.questions.findIndex((item) => item.id === q.id);
            const ans = attempt.answers[q.id];
            const isExpanded = expandedQuestions[q.id] !== false; // default expanded

            const isMCQ = q.type === "mcq";
            const isCorrect = isMCQ ? ans?.isCorrect : (ans?.theoryEvaluation?.percentage ?? 0) >= 70;

            return (
              <div
                key={q.id}
                className={`border rounded-2xl p-4 sm:p-6 space-y-4 transition-all ${
                  isDark
                    ? "bg-[#121215] border-[#27272a]"
                    : "bg-white border-zinc-200 shadow-xs"
                }`}
              >
                {/* Card Top */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-red-600 shrink-0">
                        Q{originalIndex + 1}
                      </span>
                      <span
                        className={`text-[9px] sm:text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                          isMCQ
                            ? isDark
                              ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200"
                            : isDark
                            ? "bg-red-950/60 text-red-300 border-red-900"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {isMCQ ? "Multiple Choice" : "Theory & Rubric"}
                      </span>
                      {isMCQ ? (
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                            isCorrect
                              ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200"
                          }`}
                        >
                          {isCorrect ? "Correct" : "Incorrect"}
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                            (ans?.theoryEvaluation?.percentage ?? 0) >= 70
                              ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          Score: {ans?.theoryEvaluation?.score ?? 0} / {ans?.theoryEvaluation?.maxScore ?? 5} (
                          {Math.round(ans?.theoryEvaluation?.percentage ?? 0)}%)
                        </span>
                      )}
                    </div>

                    <h3 className={`text-sm sm:text-base font-bold leading-relaxed pt-1 break-words ${isDark ? "text-[#f4f4f5]" : "text-zinc-900"}`}>
                      {q.question}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                    <button
                      id={`btn-ask-tutor-${q.id}`}
                      type="button"
                      onClick={() => onAskTutor(q)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer min-h-[34px] sm:min-h-[36px] ${
                        isDark
                          ? "bg-[#09090b] hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                          : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700"
                      }`}
                      title="Ask Tutor for deeper clarification"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span className="hidden xs:inline sm:inline">Ask Tutor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(q.id)}
                      className={`p-2 rounded-xl border transition-colors cursor-pointer min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center ${
                        isDark
                          ? "bg-[#09090b] hover:bg-zinc-800 border-zinc-700 text-zinc-400"
                          : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-600"
                      }`}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-3.5 pt-3 border-t border-inherit">
                    {/* MCQ Options Breakdown */}
                    {isMCQ ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(q as MCQQuestion).options.map((opt, optIdx) => {
                          const isSelected = ans?.selectedOptionIndex === optIdx;
                          const isActual = (q as MCQQuestion).correctAnswerIndex === optIdx;

                          let style = isDark
                            ? "border-zinc-800 bg-[#09090b] text-zinc-400"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600";

                          if (isActual) {
                            style = isDark
                              ? "border-emerald-700 bg-emerald-950/40 text-emerald-200 font-semibold ring-1 ring-emerald-500/40"
                              : "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-400/30";
                          } else if (isSelected && !isActual) {
                            style = isDark
                              ? "border-rose-900 bg-rose-950/40 text-rose-300 line-through"
                              : "border-rose-300 bg-rose-50 text-rose-950 line-through";
                          }

                          return (
                            <div key={optIdx} className={`p-3 rounded-xl border flex items-start gap-2.5 min-w-0 ${style}`}>
                              <span className="font-mono font-bold shrink-0">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <span className="leading-relaxed min-w-0 flex-1 break-words">
                                {opt}
                                {isSelected && " (Your Choice)"}
                                {isActual && " ✓"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Theory Feedback Breakdown */
                      <div className="space-y-3 text-xs">
                        <div
                          className={`p-3.5 rounded-xl border space-y-1 ${
                            isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                          }`}
                        >
                          <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                            Your Submitted Answer:
                          </span>
                          <p className={`leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>
                            {ans?.textAnswer || "(No answer submitted)"}
                          </p>
                        </div>

                        {ans?.theoryEvaluation && (
                          <div
                            className={`p-4 rounded-xl border space-y-2.5 ${
                              isDark ? "bg-[#09090b] border-zinc-800" : "bg-red-50/40 border-red-200"
                            }`}
                          >
                            <div className="font-bold text-red-600 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              Rubric Assessment & Diagnostic Feedback:
                            </div>
                            <p className={`leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                              {ans.theoryEvaluation.feedback}
                            </p>

                            {ans.theoryEvaluation.keyPointsAddressed?.length > 0 && (
                              <div className="pt-1.5">
                                <span className="font-bold text-emerald-600">Key Points Addressed:</span>
                                <ul className="list-disc list-inside space-y-0.5 mt-1 text-xs opacity-90 pl-1">
                                  {ans.theoryEvaluation.keyPointsAddressed.map((p, i) => (
                                    <li key={i}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {ans.theoryEvaluation.missingKeyPoints?.length > 0 && (
                              <div className="pt-1.5">
                                <span className="font-bold text-rose-500">Concepts to Strengthen:</span>
                                <ul className="list-disc list-inside space-y-0.5 mt-1 text-xs opacity-90 pl-1">
                                  {ans.theoryEvaluation.missingKeyPoints.map((p, i) => (
                                    <li key={i}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          className={`p-3.5 rounded-xl border space-y-1 ${
                            isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                          }`}
                        >
                          <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                            Model Solution Key:
                          </span>
                          <p className={`leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>
                            {(q as TheoryQuestion).modelAnswer}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Explanation & Source Quote */}
                    <div
                      className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                        isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                      }`}
                    >
                      <div className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                        Curriculum Reference & Explanation:
                      </div>
                      <p className={`leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        {q.explanation}
                      </p>
                      {q.sourceContext && (
                        <div className="text-[11px] italic pt-1.5 border-t border-inherit opacity-75">
                          Excerpt: "{q.sourceContext}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
