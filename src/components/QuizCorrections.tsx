import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FileText,
  Sparkles,
} from "lucide-react";
import { QuizAttempt, Question, MCQQuestion, TheoryQuestion, AppTheme } from "../types";

interface QuizCorrectionsProps {
  attempt: QuizAttempt;
  theme?: AppTheme;
  onBack: () => void;
  onAskTutor: (question: Question) => void;
}

export const QuizCorrections: React.FC<QuizCorrectionsProps> = ({
  attempt,
  theme = "red-light",
  onBack,
  onAskTutor,
}) => {
  const [filter, setFilter] = useState<"all" | "incorrect" | "theory">("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";

  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const missedQuestions = attempt.quiz.questions.filter((q) => {
    const ans = attempt.answers[q.id];
    if (q.type === "mcq") return !ans?.isCorrect;
    if (q.type === "theory") return (ans?.theoryEvaluation?.percentage ?? 0) < 70;
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

  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: `All (${attempt.quiz.questions.length})` },
    { key: "incorrect", label: `Needs work (${missedQuestions.length})` },
    ...(attempt.theoryTotalPoints > 0
      ? [{ key: "theory" as const, label: `Theory (${attempt.quiz.questions.filter((q) => q.type === "theory").length})` }]
      : []),
  ];

  const tertiaryButton = `w-full flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
    isDark
      ? "bg-[#09090b] hover:bg-zinc-800 text-zinc-200 border-zinc-700"
      : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-xs"
  }`;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* ── Where you are / how to get back ────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-0.5 h-9 pl-1 pr-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
            isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Results</span>
        </button>
        <span className={`h-4 w-px shrink-0 ${isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
        <h1 className={`text-sm font-bold truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
          Corrections & solutions
        </h1>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto -mx-2.5 px-2.5 sm:mx-0 sm:px-0">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 h-9 text-xs font-semibold rounded-xl border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              filter === f.key
                ? "bg-red-600 border-red-600 text-white"
                : isDark
                ? "bg-[#121215] border-zinc-800 text-zinc-400 hover:text-zinc-200"
                : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 shadow-xs"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Item by item ───────────────────────────────────────────────── */}
      {filteredQuestions.length === 0 ? (
        <div
          className={`p-8 rounded-2xl border text-center space-y-1 ${
            isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200"
          }`}
        >
          <p className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
            Nothing here to correct
          </p>
          <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
            You answered every question in this group correctly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((q) => {
            const originalIndex = attempt.quiz.questions.findIndex((item) => item.id === q.id);
            const ans = attempt.answers[q.id];
            const isExpanded = expandedQuestions[q.id] !== false; // default expanded

            const isMCQ = q.type === "mcq";
            const isCorrect = isMCQ ? ans?.isCorrect : (ans?.theoryEvaluation?.percentage ?? 0) >= 70;
            const theoryPct = Math.round(ans?.theoryEvaluation?.percentage ?? 0);

            const surface = isDark ? "bg-[#121215] border-[#27272a]" : "bg-white border-zinc-200 shadow-xs";
            const inset = `rounded-xl border ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`;

            return (
              <div key={q.id} className={`border rounded-2xl p-4 space-y-3.5 ${surface}`}>
                {/* Verdict line */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-red-600 shrink-0">Q{originalIndex + 1}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                      isMCQ
                        ? isDark
                          ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                          : "bg-zinc-100 text-zinc-700 border-zinc-200"
                        : isDark
                        ? "bg-red-950/60 text-red-300 border-red-900"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {isMCQ ? "Multiple choice" : "Theory"}
                  </span>
                  {isMCQ ? (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                        isCorrect
                          ? isDark
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : isDark
                          ? "bg-rose-950/60 text-rose-300 border-rose-800"
                          : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}
                    >
                      {isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                        theoryPct >= 70
                          ? isDark
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : isDark
                          ? "bg-amber-950/60 text-amber-300 border-amber-800"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {ans?.theoryEvaluation?.score ?? 0} / {ans?.theoryEvaluation?.maxScore ?? 5} · {theoryPct}%
                    </span>
                  )}
                  {ans?.flaggedForReview && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                        isDark ? "bg-amber-950/40 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      Flagged
                    </span>
                  )}
                </div>

                <h2 className={`text-sm font-bold leading-relaxed ${isDark ? "text-[#f4f4f5]" : "text-zinc-900"}`}>
                  {q.question}
                </h2>

                {/* Actions */}
                <div className={`flex items-center justify-between gap-2 pt-3 border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                  <button
                    id={`btn-ask-tutor-${q.id}`}
                    type="button"
                    onClick={() => onAskTutor(q)}
                    className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      isDark
                        ? "bg-[#09090b] hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                        : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700"
                    }`}
                    title="Ask the tutor for a deeper explanation"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>Ask tutor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleExpand(q.id)}
                    aria-expanded={isExpanded}
                    className={`flex items-center gap-1 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      isDark
                        ? "bg-[#09090b] hover:bg-zinc-800 border-zinc-700 text-zinc-400"
                        : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-600"
                    }`}
                  >
                    <span>{isExpanded ? "Hide" : "Show"}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="space-y-3">
                    {isMCQ ? (
                      <div className="space-y-2 text-xs">
                        {(q as MCQQuestion).options.map((opt, optIdx) => {
                          const isSelected = ans?.selectedOptionIndex === optIdx;
                          const isActual = (q as MCQQuestion).correctAnswerIndex === optIdx;

                          let style = isDark ? "border-zinc-800 bg-[#09090b] text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-600";

                          if (isActual) {
                            style = isDark
                              ? "border-emerald-700 bg-emerald-950/40 text-emerald-200 font-semibold"
                              : "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold";
                          } else if (isSelected && !isActual) {
                            style = isDark
                              ? "border-rose-900 bg-rose-950/40 text-rose-300 line-through"
                              : "border-rose-300 bg-rose-50 text-rose-950 line-through";
                          }

                          return (
                            <div key={optIdx} className={`p-3 rounded-xl border flex items-start gap-2.5 ${style}`}>
                              <span className="font-mono font-bold shrink-0">{String.fromCharCode(65 + optIdx)}.</span>
                              <span className="leading-relaxed flex-1 min-w-0">
                                {opt}
                                {isSelected && (
                                  <span className="whitespace-nowrap opacity-70"> — you picked this</span>
                                )}
                                {isActual && !isSelected && (
                                  <span className="whitespace-nowrap opacity-70"> — correct answer</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Theory feedback */
                      <div className="space-y-3 text-xs">
                        <div className={`p-3.5 space-y-1 ${inset}`}>
                          <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>You wrote</span>
                          <p className={`leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>
                            {ans?.textAnswer || "Nothing — this question was left blank."}
                          </p>
                        </div>

                        {ans?.theoryEvaluation && (
                          <div
                            className={`p-4 rounded-xl border space-y-2.5 ${
                              isDark ? "bg-[#09090b] border-zinc-800" : "bg-red-50/40 border-red-200"
                            }`}
                          >
                            <div className="font-bold text-red-600 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 shrink-0" />
                              Marker's feedback
                            </div>
                            <p className={`leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                              {ans.theoryEvaluation.feedback}
                            </p>

                            {ans.theoryEvaluation.keyPointsAddressed?.length > 0 && (
                              <div className="pt-1">
                                <span className="font-bold text-emerald-600">You covered</span>
                                <ul className={`list-disc list-inside space-y-0.5 mt-1 pl-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                                  {ans.theoryEvaluation.keyPointsAddressed.map((p, i) => (
                                    <li key={i}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {ans.theoryEvaluation.missingKeyPoints?.length > 0 && (
                              <div className="pt-1">
                                <span className="font-bold text-rose-500">You missed</span>
                                <ul className={`list-disc list-inside space-y-0.5 mt-1 pl-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                                  {ans.theoryEvaluation.missingKeyPoints.map((p, i) => (
                                    <li key={i}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`p-3.5 space-y-1 ${inset}`}>
                          <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>Model answer</span>
                          <p className={`leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>
                            {(q as TheoryQuestion).modelAnswer}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Explanation & source */}
                    <div className={`p-3.5 text-xs space-y-1.5 ${inset}`}>
                      <div className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Why this is the answer</div>
                      <p className={`leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{q.explanation}</p>
                      {q.sourceContext && (
                        <p className={`text-[11px] italic pt-2 border-t ${isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-500"}`}>
                          From your document: “{q.sourceContext}”
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer escape hatch for long lists */}
      <div className="flex items-center gap-2 pb-2">
        <button type="button" onClick={onBack} className={tertiaryButton}>
          <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
          <span>Back to results</span>
        </button>
        <div className={`flex items-center gap-1.5 text-[11px] shrink-0 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono tabular-nums">
            {filteredQuestions.length}/{attempt.quiz.questions.length}
          </span>
        </div>
      </div>
    </div>
  );
};
