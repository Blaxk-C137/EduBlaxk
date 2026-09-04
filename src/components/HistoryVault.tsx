import React, { useState, useEffect } from "react";
import {
  History,
  Search,
  Trash2,
  Download,
  Eye,
  RotateCcw,
  X,
  Database,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QuizAttempt, AppTheme, StoredQuestionRecord } from "../types";
import {
  exportVaultJSON,
  getStoredQuestionBank,
  exportQuestionBankJSON,
  clearStoredQuestionBank,
} from "../lib/storage";

interface HistoryVaultProps {
  isOpen: boolean;
  attempts: QuizAttempt[];
  theme?: AppTheme;
  onClose: () => void;
  onSelectAttempt: (attempt: QuizAttempt) => void;
  onDeleteAttempt: (id: string) => void;
  onRefreshVault: () => void;
  onRetakeAttempt: (attempt: QuizAttempt) => void;
}

export const HistoryVault: React.FC<HistoryVaultProps> = ({
  isOpen,
  attempts,
  theme = "red-light",
  onClose,
  onSelectAttempt,
  onDeleteAttempt,
  onRefreshVault,
  onRetakeAttempt,
}) => {
  const [activeTab, setActiveTab] = useState<"attempts" | "question-bank">("attempts");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRating, setFilterRating] = useState<string>("all");
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>("all");
  const [questionBank, setQuestionBank] = useState<StoredQuestionRecord[]>([]);
  const [expandedBankQuestions, setExpandedBankQuestions] = useState<Record<string, boolean>>({});

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;

  useEffect(() => {
    if (isOpen) {
      setQuestionBank(getStoredQuestionBank());
    }
  }, [isOpen, attempts]);

  if (!isOpen) return null;

  const toggleExpandBankQ = (id: string) => {
    setExpandedBankQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleClearBank = () => {
    if (window.confirm("Are you sure you want to clear the entire anti-duplication question bank JSON? Gemini will no longer have previous questions to skip.")) {
      clearStoredQuestionBank();
      setQuestionBank([]);
      onRefreshVault();
    }
  };

  // Unique document names from question bank
  const allDocNames = Array.from(
    new Set(questionBank.flatMap((q) => q.documentNames || []))
  );

  const filteredAttempts = attempts.filter((att) => {
    const matchesSearch =
      att.quizTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      att.quiz.documentNames.some((d) => d.toLowerCase().includes(searchTerm.toLowerCase())) ||
      att.quiz.topicsCovered.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRating = filterRating === "all" || att.ratingGrade === filterRating;
    return matchesSearch && matchesRating;
  });

  const filteredBank = questionBank.filter((q) => {
    const matchesSearch =
      q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.topic && q.topic.toLowerCase().includes(searchTerm.toLowerCase())) ||
      q.documentNames.some((d) => d.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDoc =
      selectedDocFilter === "all" ||
      q.documentNames.some((d) => d.toLowerCase() === selectedDocFilter.toLowerCase());

    return matchesSearch && matchesDoc;
  });

  return (
    <div
      id="vault-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="vault-modal"
        className={`w-full max-w-3xl border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 text-zinc-900"
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 sm:px-6 py-4 border-b border-inherit ${isDark ? "bg-[#09090b]" : "bg-zinc-50"}`}>
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
              }`}
            >
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Assessment Vault & Question Bank</h3>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {attempts.length} quiz records &bull; {questionBank.length} questions indexed in JSON memory
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={activeTab === "attempts" ? exportVaultJSON : exportQuestionBankJSON}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer min-h-[36px] ${
                isDark
                  ? "bg-[#18181b] hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                  : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 shadow-xs"
              }`}
              title="Download backup JSON"
            >
              <Download className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden sm:inline">{activeTab === "attempts" ? "Export Vault JSON" : "Export Bank JSON"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className={`px-4 sm:px-6 pt-3 pb-2 border-b border-inherit flex items-center gap-2 ${isDark ? "bg-[#0c0c0e]" : "bg-zinc-100/60"}`}>
          <button
            type="button"
            onClick={() => setActiveTab("attempts")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === "attempts"
                ? "bg-red-600 text-white shadow-xs"
                : isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Assessment Attempts ({attempts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("question-bank")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === "question-bank"
                ? "bg-red-600 text-white shadow-xs"
                : isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-white"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Question Bank JSON ({questionBank.length})</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className={`p-4 border-b border-inherit flex flex-col sm:flex-row items-center gap-3 ${isDark ? "bg-[#09090b]/50" : "bg-zinc-50/50"}`}>
          <div className="relative flex-1 w-full">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeTab === "attempts" ? "Search past assessments, topics..." : "Search saved questions, formulas..."}
              className={`w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none transition-colors min-h-[40px] ${
                isDark
                  ? "bg-[#18181b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                  : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
              }`}
            />
          </div>

          {activeTab === "attempts" ? (
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {["all", "Mastered", "Proficient", "Needs Review"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilterRating(r)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize whitespace-nowrap min-h-[38px] transition-all cursor-pointer ${
                    filterRating === r
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                      ? "bg-[#18181b] border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      : "bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {r === "all" ? "All Grades" : r}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {allDocNames.length > 0 && (
                <select
                  value={selectedDocFilter}
                  onChange={(e) => setSelectedDocFilter(e.target.value)}
                  className={`border rounded-xl px-3 py-2 text-xs font-medium outline-none min-h-[38px] ${
                    isDark
                      ? "bg-[#18181b] border-zinc-800 text-zinc-200"
                      : "bg-white border-zinc-200 text-zinc-800"
                  }`}
                >
                  <option value="all">All Documents ({questionBank.length})</option>
                  {allDocNames.map((d, i) => (
                    <option key={i} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

              {questionBank.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearBank}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer min-h-[38px] flex items-center justify-center ${
                    isDark ? "border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800" : "border-zinc-200 text-zinc-500 hover:text-rose-600 hover:bg-rose-50"
                  }`}
                  title="Clear Question Bank JSON"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          {activeTab === "attempts" ? (
            filteredAttempts.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <div
                  className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center ${
                    isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <History className="w-5 h-5" />
                </div>
                <h4 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  No Assessment Records Found
                </h4>
                <p className={`text-xs max-w-sm mx-auto ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {attempts.length === 0
                    ? "Synthesize and submit your first test to build a permanent local study vault."
                    : "No quiz records matched your search query."}
                </p>
              </div>
            ) : (
              filteredAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isDark
                      ? "bg-[#18181b]/60 hover:bg-[#18181b] border-zinc-800"
                      : "bg-zinc-50/50 hover:bg-white border-zinc-200 hover:shadow-xs"
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          attempt.ratingGrade === "Mastered"
                            ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : isDark ? "bg-red-950/60 text-red-300 border-red-800" : "bg-red-50 text-red-800 border-red-200"
                        }`}
                      >
                        {attempt.ratingGrade}
                      </span>
                      <span className="text-xs font-mono font-bold text-red-600">
                        {Math.round(attempt.overallPercentage)}%
                      </span>
                      <span className={`text-[11px] font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        {new Date(attempt.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className={`text-sm font-bold break-words ${isDark ? "text-[#f4f4f5]" : "text-zinc-900"}`}>
                      {attempt.quizTitle}
                    </h4>
                    <p className={`text-xs break-words ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      {attempt.quiz.documentNames.join(", ")} &bull; {attempt.totalQuestions} questions &bull; {Math.floor(attempt.timeTakenSeconds / 60)}m {attempt.timeTakenSeconds % 60}s
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAttempt(attempt);
                        onClose();
                      }}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer min-h-[38px] ${
                        isDark
                          ? "bg-[#09090b] hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                          : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 shadow-xs"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>Review</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onRetakeAttempt(attempt);
                        onClose();
                      }}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-xs font-bold rounded-xl text-white shadow-xs transition-all cursor-pointer min-h-[38px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Retake</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteAttempt(attempt.id)}
                      className={`p-2 rounded-xl transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0 ${
                        isDark ? "text-zinc-400 hover:text-rose-400 hover:bg-zinc-800" : "text-zinc-400 hover:text-rose-600 hover:bg-rose-50"
                      }`}
                      title="Delete record"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            filteredBank.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <div
                  className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center ${
                    isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <Database className="w-5 h-5" />
                </div>
                <h4 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  No Questions in Question Bank JSON
                </h4>
                <p className={`text-xs max-w-sm mx-auto ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  Generate an assessment from any document to automatically populate the JSON question bank.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${isDark ? "bg-[#09090b] border-zinc-800 text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-700"}`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>
                      <strong>{filteredBank.length}</strong> unique questions indexed in local JSON. Gemini avoids these on repeat generations.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={exportQuestionBankJSON}
                    className="font-bold underline text-red-600 hover:text-red-700 cursor-pointer shrink-0 ml-2"
                  >
                    Download JSON
                  </button>
                </div>

                {filteredBank.map((q, idx) => {
                  const isExpanded = expandedBankQuestions[q.id] || false;
                  return (
                    <div
                      key={q.id || idx}
                      className={`p-3.5 sm:p-4 rounded-xl border transition-all space-y-2.5 ${
                        isDark ? "bg-[#18181b]/70 border-zinc-800" : "bg-white border-zinc-200 shadow-xs"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                q.type === "mcq"
                                  ? isDark ? "bg-red-950/60 text-red-300 border border-red-800" : "bg-red-50 text-red-700 border border-red-200"
                                  : isDark ? "bg-amber-950/60 text-amber-300 border border-amber-800" : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {q.type.toUpperCase()}
                            </span>
                            <span className={`text-[11px] font-medium truncate max-w-[200px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                              {q.documentNames?.join(", ")}
                            </span>
                            {q.topic && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
                                {q.topic}
                              </span>
                            )}
                          </div>

                          <h5 className={`text-xs sm:text-sm font-semibold break-words pt-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                            {q.question}
                          </h5>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpandBankQ(q.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                            isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className={`pt-2.5 border-t text-xs space-y-2 border-inherit ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                          {q.type === "mcq" && q.options && (
                            <div className="space-y-1">
                              <span className="font-semibold text-[11px]">Options:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {q.options.map((opt, optIdx) => (
                                  <div
                                    key={optIdx}
                                    className={`p-2 rounded-lg text-xs break-words border ${
                                      optIdx === q.correctAnswerIndex
                                        ? isDark ? "bg-emerald-950/40 border-emerald-800 text-emerald-300 font-semibold" : "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                                        : isDark ? "bg-[#09090b] border-zinc-800 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-600"
                                    }`}
                                  >
                                    <span className="font-mono mr-1.5">{String.fromCharCode(65 + optIdx)}.</span>
                                    {opt}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {q.type === "theory" && q.modelAnswer && (
                            <div className={`p-2.5 rounded-lg border space-y-1 ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
                              <div className="font-bold text-[11px] text-red-600">Model Answer:</div>
                              <p className="leading-relaxed break-words text-xs">{q.modelAnswer}</p>
                            </div>
                          )}

                          {q.explanation && (
                            <div className={`p-2.5 rounded-lg border ${isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
                              <span className="font-bold text-[11px]">Explanation: </span>
                              <span className="break-words">{q.explanation}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

