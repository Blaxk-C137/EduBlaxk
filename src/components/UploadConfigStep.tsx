import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Sliders,
  Play,
  AlertCircle,
  FileCheck,
  Clock,
  Zap,
  Sparkles,
  BookOpen,
  HelpCircle,
  ShieldCheck,
  Download,
  Database,
} from "lucide-react";
import { UploadedFileSummary, UserPreferences } from "../types";
import { getPreviousQuestionsForDocuments, exportQuestionBankJSON } from "../lib/storage";

interface UploadConfigStepProps {
  preferences: UserPreferences;
  initialFiles?: UploadedFileSummary[];
  onGenerateQuiz: (params: {
    files: UploadedFileSummary[];
    mcqCount: number;
    theoryCount: number;
    difficulty: string;
    studyFocus: string;
    mode: "practice" | "exam";
    antiDuplicate: boolean;
  }) => void;
  isLoading: boolean;
  onOpenSettings: () => void;
}

const MAX_TOTAL_SIZE_MB = 20;
const MAX_TOTAL_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;

export const UploadConfigStep: React.FC<UploadConfigStepProps> = ({
  preferences,
  initialFiles = [],
  onGenerateQuiz,
  isLoading,
  onOpenSettings,
}) => {
  const [files, setFiles] = useState<UploadedFileSummary[]>(initialFiles);
  const [mcqCount, setMcqCount] = useState(preferences.defaultMcqCount || 10);
  const [includeTheory, setIncludeTheory] = useState(preferences.defaultTheoryCount > 0);
  const [theoryCount, setTheoryCount] = useState(preferences.defaultTheoryCount || 3);
  const [difficulty, setDifficulty] = useState(preferences.defaultDifficulty || "Intermediate");
  const [studyFocus, setStudyFocus] = useState("");
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [antiDuplicate, setAntiDuplicate] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync initialFiles if provided
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && files.length === 0) {
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  const currentTheme = preferences.theme || "red-light";
  const isDark = currentTheme === "black-red-dark" || currentTheme === "carbon-dark";
  const isLight = !isDark;
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const sizePercentage = Math.min(100, (totalBytes / MAX_TOTAL_BYTES) * 100);

  // Check how many questions already exist in JSON memory for these documents
  const docNames = files.map((f) => f.name);
  const previousQuestions = getPreviousQuestionsForDocuments(docNames);
  const previousCount = previousQuestions.length;

  const handleFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setErrorMessage(null);

    const newFiles: UploadedFileSummary[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        setErrorMessage(`Total files exceed the ${MAX_TOTAL_SIZE_MB}MB limit. Could not add "${file.name}".`);
        continue;
      }

      try {
        if (file.type.includes("pdf")) {
          const base64 = await readFileAsBase64(file);
          newFiles.push({
            id: `file-${Date.now()}-${i}`,
            name: file.name,
            size: file.size,
            type: file.type || "application/pdf",
            base64,
          });
        } else {
          const textContent = await readFileAsText(file);
          newFiles.push({
            id: `file-${Date.now()}-${i}`,
            name: file.name,
            size: file.size,
            type: file.type || "text/plain",
            textContent,
          });
        }
      } catch (err) {
        console.error("Error reading file:", err);
        setErrorMessage(`Could not read file "${file.name}".`);
      }
    }

    setFiles((prev) => [...prev, ...newFiles]);
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStart = () => {
    if (files.length === 0) {
      setErrorMessage("Please upload at least one document or lecture file to synthesize an assessment.");
      return;
    }

    if (!preferences.hasCompletedWizard) {
      onOpenSettings();
      return;
    }

    onGenerateQuiz({
      files,
      mcqCount: Number(mcqCount),
      theoryCount: includeTheory ? Number(theoryCount) : 0,
      difficulty,
      studyFocus,
      mode,
      antiDuplicate,
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-5 px-2 sm:px-0 overflow-hidden">
      {/* Title Banner */}
      <div
        className={`p-4 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 text-zinc-900 shadow-xs"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${isDark ? "text-red-400" : "text-red-600"}`}>
                Multi-Doc Synthesis & Anti-Duplicate Memory
              </span>
            </div>
            <h1 className={`text-lg sm:text-2xl font-bold tracking-tight break-words ${isDark ? "text-[#fafafa]" : "text-zinc-900"}`}>
              Curriculum & Assessment Engine
            </h1>
            <p className={`text-xs max-w-2xl leading-relaxed break-words ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              Transform textbooks, slide decks, and lecture notes into customized diagnostic tests.
              All generated questions are indexed to local JSON so repeat practice always delivers 100% fresh material.
            </p>
          </div>

          <div
            className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2.5 sm:gap-3 shrink-0 self-start sm:self-auto ${
              isDark ? "bg-[#09090b] border-[#27272a]" : "bg-zinc-50 border-zinc-200"
            }`}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              AI
            </div>
            <div className="min-w-0">
              <div className={`text-xs font-semibold whitespace-nowrap ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                JSON Memory Guard
              </div>
              <div className={`text-[10px] sm:text-[11px] whitespace-nowrap ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Zero Sloppy Repeats
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Left Column: Source Documents */}
        <div className="lg:col-span-7 space-y-4 min-w-0">
          <div
            className={`border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 transition-all ${
              isDark
                ? "bg-[#121215] border-[#27272a]"
                : "bg-white border-zinc-200 shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-inherit gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isDark ? "bg-red-950/60 text-red-400 border border-red-900/50" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <h2 className={`text-xs font-bold uppercase tracking-wider truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  Source Materials
                </h2>
              </div>
              <span className={`text-[11px] font-mono font-medium shrink-0 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {totalMB} / {MAX_TOTAL_SIZE_MB} MB
              </span>
            </div>

            {/* Storage Gauge */}
            <div className="space-y-1">
              <div className={`w-full ${isDark ? "bg-zinc-800" : "bg-zinc-100"} h-1.5 rounded-full overflow-hidden`}>
                <div
                  className="h-full bg-red-600 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(3, sizePercentage)}%` }}
                />
              </div>
            </div>

            {/* Drop Zone */}
            <div
              id="pdf-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 sm:p-8 text-center cursor-pointer transition-all duration-150 ${
                isDragging
                  ? "border-red-500 bg-red-950/30 scale-[0.99]"
                  : isDark
                  ? "border-zinc-800 hover:border-red-800 bg-[#09090b] hover:bg-zinc-900/60"
                  : "border-zinc-300 hover:border-red-400 bg-zinc-50/50 hover:bg-red-50/30"
              }`}
            >
              <input
                id="file-upload-input"
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
                multiple
                accept=".pdf,.txt,.md"
                className="hidden"
              />

              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-colors ${
                  isDark
                    ? "bg-zinc-900 border border-zinc-800 text-red-500"
                    : "bg-white border border-zinc-200 text-red-600 shadow-xs"
                }`}
              >
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>

              <div className={`font-semibold text-xs sm:text-sm break-words ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                Drop lecture PDFs or course notes here
              </div>
              <p className={`text-[11px] sm:text-xs mt-1 max-w-sm mx-auto leading-relaxed break-words ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Select single or multiple files (PDF, TXT, Markdown). Upload up to {MAX_TOTAL_SIZE_MB}MB at once.
              </p>
            </div>

            {/* Uploaded Files List */}
            {files.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-inherit">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>
                    Uploaded Documents ({files.length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-red-500 hover:text-red-400 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-xs transition-colors gap-2 ${
                        isDark
                          ? "bg-[#09090b] border-zinc-800 hover:bg-zinc-900 text-zinc-200"
                          : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCheck className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="font-medium truncate text-xs">{file.name}</span>
                        <span
                          className={`text-[9px] sm:text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded ${
                            isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                          isDark
                            ? "text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                            : "text-zinc-400 hover:text-red-600 hover:bg-red-50"
                        }`}
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anti-Duplication Memory Badge */}
            {files.length > 0 && (
              <div
                className={`p-3.5 rounded-xl border transition-all text-xs space-y-2 ${
                  previousCount > 0
                    ? isDark
                      ? "bg-emerald-950/30 border-emerald-900/60 text-emerald-300"
                      : "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : isDark
                    ? "bg-[#09090b] border-zinc-800 text-zinc-400"
                    : "bg-zinc-50 border-zinc-200 text-zinc-600"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 shrink-0 ${previousCount > 0 ? "text-emerald-500" : "text-zinc-400"}`} />
                    <span className="font-bold">
                      {previousCount > 0
                        ? `Anti-Duplicate Memory Active (${previousCount} Past Qs Saved)`
                        : "Anti-Duplicate Guard Ready"}
                    </span>
                  </div>
                  {previousCount > 0 && (
                    <button
                      type="button"
                      onClick={exportQuestionBankJSON}
                      className={`flex items-center gap-1 text-[11px] font-semibold underline cursor-pointer shrink-0 ${
                        isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-900"
                      }`}
                      title="Download JSON of all past questions for this document"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export Qs JSON</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed break-words">
                  {previousCount > 0
                    ? `Gemini will automatically avoid the ${previousCount} questions previously generated for this document and formulate completely fresh items from unexplored concepts.`
                    : "Every question generated from this document will be automatically cataloged into your local JSON question bank to prevent sloppy repeats in future rounds."}
                </p>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-start gap-2.5 break-words">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quiz Configuration */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          <div
            className={`border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 transition-all ${
              isDark
                ? "bg-[#121215] border-[#27272a]"
                : "bg-white border-zinc-200 shadow-xs"
            }`}
          >
            <div className="flex items-center gap-2 border-b pb-3 border-inherit">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isDark ? "bg-red-950/60 text-red-400 border border-red-900/50" : "bg-red-50 text-red-600 border border-red-200"}`}>
                <Sliders className="w-3.5 h-3.5" />
              </div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Parameters
              </h2>
            </div>

            {/* MCQ Count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  Multiple Choice (MCQs)
                </label>
                <span className={`text-xs font-mono font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>
                  {mcqCount} Questions
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
                {[5, 10, 15, 20, 30].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMcqCount(num)}
                    className={`py-2 px-1 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer min-h-[36px] text-center ${
                      mcqCount === num
                        ? "bg-red-600 border-red-600 text-white shadow-xs"
                        : isDark
                        ? "bg-[#09090b] border-zinc-800 text-zinc-300 hover:bg-zinc-900"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Theory Questions Toggle & Count */}
            <div
              className={`p-3.5 sm:p-4 rounded-xl border space-y-3 transition-colors ${
                isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                    Theory & Essay Prompts
                  </div>
                  <div className={`text-[10px] sm:text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Graded against criteria rubrics
                  </div>
                </div>
                <input
                  id="toggle-include-theory"
                  type="checkbox"
                  checked={includeTheory}
                  onChange={(e) => setIncludeTheory(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
                />
              </div>

              {includeTheory && (
                <div className="pt-3 border-t border-inherit space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? "text-zinc-400" : "text-zinc-600"}>Theory Prompts:</span>
                    <span className={`font-mono font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>{theoryCount} Questions</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                    {[2, 3, 5, 8].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setTheoryCount(num)}
                        className={`py-2 px-1 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer min-h-[36px] text-center ${
                          theoryCount === num
                            ? "bg-red-600 border-red-600 text-white shadow-xs"
                            : isDark
                            ? "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                            : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {num} Qs
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Anti-Duplicate Memory Switch */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
              }`}
            >
              <div className="space-y-0.5 min-w-0">
                <div className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  <ShieldCheck className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>Anti-Duplicate Protection</span>
                </div>
                <div className={`text-[10px] sm:text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  Instruct Gemini to skip past questions from JSON bank
                </div>
              </div>
              <input
                id="toggle-anti-duplicate"
                type="checkbox"
                checked={antiDuplicate}
                onChange={(e) => setAntiDuplicate(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
              />
            </div>

            {/* Difficulty */}
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Academic Rigor Level
              </label>
              <select
                id="select-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none transition-colors min-h-[42px] ${
                  isDark
                    ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500"
                    : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                }`}
              >
                <option value="Foundational">Foundational (Core Terminology & Concepts)</option>
                <option value="Intermediate">Intermediate (Application & Analysis)</option>
                <option value="Advanced">Advanced (Complex Problem-Solving & Synthesis)</option>
                <option value="Conceptual">Conceptual Deep-Dive</option>
              </select>
            </div>

            {/* Study Mode: Practice vs Timed Exam */}
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Assessment Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("practice")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 min-h-[44px] ${
                    mode === "practice"
                      ? isDark
                        ? "bg-red-950/40 border-red-800 text-white"
                        : "bg-red-50 border-red-300 text-zinc-900 ring-1 ring-red-500/20"
                      : isDark
                      ? "bg-[#09090b] border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                      : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <Zap className={`w-4 h-4 mt-0.5 shrink-0 ${mode === "practice" ? "text-red-500" : "text-zinc-400"}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">Practice Mode</div>
                    <div className={`text-[10px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      Instant explanations
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("exam")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 min-h-[44px] ${
                    mode === "exam"
                      ? isDark
                        ? "bg-red-950/40 border-red-800 text-white"
                        : "bg-red-50 border-red-300 text-zinc-900 ring-1 ring-red-500/20"
                      : isDark
                      ? "bg-[#09090b] border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                      : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${mode === "exam" ? "text-red-500" : "text-zinc-400"}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">Exam Simulation</div>
                    <div className={`text-[10px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      Timed blind assessment
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Specific Focus */}
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Target Chapter or Topic (Optional)
              </label>
              <input
                id="input-study-focus"
                type="text"
                value={studyFocus}
                onChange={(e) => setStudyFocus(e.target.value)}
                placeholder="e.g. Chapter 3, Organic Reactions, Formulas"
                className={`w-full border rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors min-h-[42px] ${
                  isDark
                    ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                    : "bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400 focus:border-red-600"
                }`}
              />
            </div>

            {/* Action Button */}
            <button
              id="btn-generate-quiz"
              type="button"
              onClick={handleStart}
              disabled={isLoading || files.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer min-h-[44px]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  <span className="truncate">Synthesizing Assessment (Anti-Duplicate Enabled)...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white shrink-0" />
                  <span>
                    {previousCount > 0 ? "Generate Fresh Questions (No Repeats)" : "Generate Assessment"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

