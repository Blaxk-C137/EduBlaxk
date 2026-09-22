import React from "react";
import {
  RotateCcw,
  Download,
  Printer,
  FileText,
  ShieldCheck,
  PlusCircle,
} from "lucide-react";
import { QuizAttempt, Question, AppTheme } from "../types";
import { printAttemptReport, exportQuestionBankJSON } from "../lib/storage";

interface QuizResultsProps {
  attempt: QuizAttempt;
  theme?: AppTheme;
  onRetakeAll: () => void;
  onRetakeMissed: (missedQuestions: Question[]) => void;
  onNewQuiz: () => void;
  onViewCorrections: () => void;
  onGenerateMoreQuestions?: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  attempt,
  theme = "red-light",
  onRetakeAll,
  onRetakeMissed,
  onNewQuiz,
  onViewCorrections,
  onGenerateMoreQuestions,
}) => {
  const isDark = theme === "black-red-dark" || theme === "carbon-dark";

  const missedQuestions = attempt.quiz.questions.filter((q) => {
    const ans = attempt.answers[q.id];
    if (q.type === "mcq") return !ans?.isCorrect;
    if (q.type === "theory") return (ans?.theoryEvaluation?.percentage ?? 0) < 70;
    return false;
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

  const surface = `border rounded-2xl ${isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200 shadow-sm"}`;
  const secondaryButton = `w-full flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
    isDark
      ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
      : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
  }`;
  const quietButton = `w-full flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl border font-medium text-xs transition-colors cursor-pointer ${
    isDark
      ? "bg-transparent hover:bg-zinc-900 text-zinc-400 border-transparent hover:border-zinc-800"
      : "bg-transparent hover:bg-zinc-100 text-zinc-500 border-transparent hover:border-zinc-200"
  }`;

  const stats = [
    { value: `${attempt.mcqCorrect} / ${attempt.mcqTotal}`, label: "MCQ correct" },
    { value: `${attempt.theoryEarnedPoints} / ${attempt.theoryTotalPoints}`, label: "Theory marks" },
    {
      value: `${Math.floor(attempt.timeTakenSeconds / 60)}m ${attempt.timeTakenSeconds % 60}s`,
      label: "Time taken",
    },
    { value: attempt.quiz.difficulty, label: "Rigor", capitalize: true },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* ── What you scored ────────────────────────────────────────────── */}
      <div className={`${surface} p-4 sm:p-6 space-y-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${getRatingBadge(attempt.ratingGrade)}`}>
                {attempt.ratingGrade}
              </span>
              <span className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                {new Date(attempt.timestamp).toLocaleDateString()}
              </span>
            </div>

            <h1 className={`text-lg sm:text-2xl font-bold tracking-tight leading-snug ${isDark ? "text-[#f4f4f5]" : "text-zinc-900"}`}>
              {attempt.quizTitle}
            </h1>
          </div>

          <div className="text-right shrink-0">
            <div className="text-3xl sm:text-5xl font-extrabold font-mono text-red-600 tracking-tight leading-none tabular-nums">
              {Math.round(attempt.overallPercentage)}%
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-wide mt-1.5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              Mastery
            </div>
          </div>
        </div>

        {attempt.quiz.modelUsed && (
          <p className={`text-[11px] font-mono truncate ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
            Graded by {attempt.quiz.modelUsed}
          </p>
        )}

        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
          {stats.map((s) => (
            <div
              key={s.label}
              className={`p-2.5 rounded-xl border text-center ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}
            >
              <div className={`text-sm sm:text-base font-bold font-mono tabular-nums truncate ${s.capitalize ? "capitalize" : ""} ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                {s.value}
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 truncate ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── What to do next ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onViewCorrections}
        className="w-full flex items-center justify-center gap-2 h-12 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
      >
        <FileText className="w-4 h-4 shrink-0" />
        <span>Review corrections & solutions</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        {onGenerateMoreQuestions && (
          <button id="btn-more-questions" type="button" onClick={onGenerateMoreQuestions} className={secondaryButton}>
            <PlusCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>More questions</span>
          </button>
        )}

        <button id="btn-retake-all" type="button" onClick={onRetakeAll} className={secondaryButton}>
          <RotateCcw className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span>Retake test</span>
        </button>

        {missedQuestions.length > 0 && (
          <button
            id="btn-retake-missed"
            type="button"
            onClick={() => onRetakeMissed(missedQuestions)}
            className={secondaryButton}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Retake {missedQuestions.length} missed</span>
          </button>
        )}

        <button id="btn-new-test" type="button" onClick={onNewQuiz} className={secondaryButton}>
          <PlusCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>New PDF</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button id="btn-print-report" type="button" onClick={() => printAttemptReport(attempt)} className={quietButton}>
          <Printer className="w-3.5 h-3.5 shrink-0" />
          <span>Print sheet</span>
        </button>
        <button id="btn-export-attempt-json" type="button" onClick={handleExportJSON} className={quietButton}>
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Export JSON</span>
        </button>
      </div>

      {/* ── Quiet footnote ─────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[11px] ${
          isDark ? "bg-[#121215] border-[#27272a] text-zinc-400" : "bg-white border-zinc-200 text-zinc-600"
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="flex-1 min-w-0 leading-relaxed">
          All {attempt.quiz.questions.length} questions saved to your local bank — new quizzes on this PDF skip them.
        </span>
        <button
          type="button"
          onClick={exportQuestionBankJSON}
          className={`font-semibold underline shrink-0 cursor-pointer ${isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-900"}`}
          title="Download complete Question Bank JSON"
        >
          Download
        </button>
      </div>
    </div>
  );
};
