import React, { useEffect, useState } from "react";
import { Key, CheckCircle2, AlertCircle, ExternalLink, ArrowRight, BookOpen, HardDrive, Eye, EyeOff, FileText } from "lucide-react";
import { UserPreferences, AppTheme, ModelInfo } from "../types";
import { saveProviderKey, getModels } from "../lib/api";

interface SetupWizardProps {
  isOpen: boolean;
  preferences: UserPreferences;
  theme?: AppTheme;
  onSavePreferences: (prefs: Partial<UserPreferences>) => void;
  onClose: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  isOpen,
  preferences,
  theme = "red-light",
  onSavePreferences,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("google");
  const [selectedModel, setSelectedModel] = useState<string>("google:gemini-2.5-flash");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const [defaultMcq, setDefaultMcq] = useState(preferences.defaultMcqCount || 10);
  const [defaultTheory, setDefaultTheory] = useState(preferences.defaultTheoryCount || 3);
  const [autoSave, setAutoSave] = useState(preferences.autoSaveToVault !== false);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;

  if (!isOpen) return null;

  useEffect(() => {
    getModels()
      .then((list) => {
        setModels(list);
        const withKey = list.find((m) => m.hasKey);
        if (withKey) {
          setSelectedProvider(withKey.provider);
          setSelectedModel(withKey.id);
        }
      })
      .catch(() => setModels([]));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setValidationStatus({ tested: true, success: false, message: "Please paste your API key." });
      return;
    }
    setIsSavingKey(true);
    setValidationStatus(null);
    try {
      const res = await saveProviderKey(selectedProvider, apiKeyInput.trim(), selectedModel);
      setValidationStatus({ tested: true, success: true, message: res.message });
      setApiKeyInput("");
    } catch (err: any) {
      setValidationStatus({ tested: true, success: false, message: err.message || "Failed to save API key." });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleFinish = () => {
    onSavePreferences({
      hasCompletedWizard: true,
      preferredModel: selectedModel,
      defaultMcqCount: defaultMcq,
      defaultTheoryCount: defaultTheory,
      autoSaveToVault: autoSave,
    });
    onClose();
  };

  return (
    <div
      id="setup-wizard-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="setup-wizard-modal"
        className={`w-full max-w-lg border rounded-2xl shadow-2xl overflow-hidden transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 text-zinc-900 shadow-xl"
        }`}
      >
        {/* Progress header */}
        <div className={`flex border-b border-inherit ${isDark ? "bg-[#09090b]" : "bg-zinc-50"}`}>
          <div
            className={`flex-1 py-3 px-3 text-center text-xs font-semibold tracking-wide ${
              step >= 1
                ? isDark
                  ? "text-red-400 border-b-2 border-red-500 bg-red-950/20"
                  : "text-red-600 border-b-2 border-red-600 bg-red-50/50"
                : isDark ? "text-zinc-500" : "text-zinc-400"
            }`}
          >
            1. Overview
          </div>
          <div
            className={`flex-1 py-3 px-3 text-center text-xs font-semibold tracking-wide ${
              step >= 2
                ? isDark
                  ? "text-red-400 border-b-2 border-red-500 bg-red-950/20"
                  : "text-red-600 border-b-2 border-red-600 bg-red-50/50"
                : isDark ? "text-zinc-500" : "text-zinc-400"
            }`}
          >
            2. API Key
          </div>
          <div
            className={`flex-1 py-3 px-3 text-center text-xs font-semibold tracking-wide ${
              step >= 3
                ? isDark
                  ? "text-red-400 border-b-2 border-red-500 bg-red-950/20"
                  : "text-red-600 border-b-2 border-red-600 bg-red-50/50"
                : isDark ? "text-zinc-500" : "text-zinc-400"
            }`}
          >
            3. Defaults
          </div>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-7 space-y-5">
          {/* STEP 1: WELCOME */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold ${
                  isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                <BookOpen className="w-5 h-5" />
              </div>

              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  Welcome to EduBLAXK
                </h2>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Academic assessment and curriculum synthesis platform. Converts course syllabi, lecture slides,
                  and textbook chapters into diagnostic MCQs and rubric-evaluated essay assignments.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <HardDrive className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      Local-First Privacy
                    </h4>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      All quiz attempts, answers, and study vault files stay on your device.
                    </p>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <FileText className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      Rubric Evaluations
                    </h4>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      Automated scoring of open-ended essay questions with point-by-point feedback.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-inherit">
                <button
                  id="btn-wizard-next-1"
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-5 py-2.5 min-h-[42px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                >
                  <span>Configure AI Provider</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: AI PROVIDER & KEY */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Key className="w-4 h-4 text-red-600" />
                  AI Provider Configuration
                </h2>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Choose a provider, pick a model, and paste your API key. Gemini has a free tier.
                </p>
              </div>

              <div className="space-y-2">
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    const first = models.find((m) => m.provider === e.target.value);
                    if (first) setSelectedModel(first.id);
                  }}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  <option value="google">Google Gemini (recommended — free tier)</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                </select>

                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  {models
                    .filter((m) => m.provider === selectedProvider)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.freeTier ? " (free tier)" : ""}
                      </option>
                    ))}
                </select>

                <div className="relative">
                  <input
                    id="input-wizard-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setValidationStatus(null);
                    }}
                    placeholder="Paste your API key"
                    className={`w-full border rounded-xl pl-3.5 pr-20 py-2.5 text-xs outline-none font-mono transition-colors min-h-[42px] ${
                      isDark
                        ? "bg-[#09090b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                        : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                        isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"
                      }`}
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveKey}
                      disabled={isSavingKey || !apiKeyInput.trim()}
                      className={`px-2.5 py-1 min-h-[32px] text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                        isDark
                          ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200 disabled:opacity-40"
                          : "bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-700 disabled:opacity-40"
                      }`}
                    >
                      {isSavingKey ? "Saving..." : "Save & Test"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className={`break-words ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Your key is saved in this app's server config on your computer — never in your browser.
                  </span>
                  <a
                    href={selectedProvider === "google" ? "https://aistudio.google.com/app/apikey" : selectedProvider === "anthropic" ? "https://console.anthropic.com/settings/keys" : "https://platform.openai.com/api-keys"}
                    target="_blank"
                    rel="noreferrer"
                    className={`hover:underline flex items-center gap-1 font-semibold shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`}
                  >
                    <span>Get API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {validationStatus && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    validationStatus.success
                      ? isDark ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : isDark ? "bg-red-950/40 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  {validationStatus.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <span>{validationStatus.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-inherit">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`px-4 py-2 min-h-[40px] text-xs font-semibold transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Back
                </button>
                <button
                  id="btn-wizard-next-2"
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 px-5 py-2.5 min-h-[42px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREFERENCES */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold">
                  Assessment Defaults
                </h2>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Set your preferred question parameters for new study sessions.
                </p>
              </div>

              <div className="space-y-3">
                <div
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                    isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <div>
                    <div className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Default MCQ Count</div>
                    <div className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>Multiple choice questions per session</div>
                  </div>
                  <select
                    value={defaultMcq}
                    onChange={(e) => setDefaultMcq(Number(e.target.value))}
                    className={`border rounded-lg px-3 py-1.5 text-xs font-medium outline-none min-h-[36px] ${
                      isDark ? "bg-zinc-900 border-zinc-700 text-zinc-200 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                    }`}
                  >
                    {[5, 10, 15, 20, 30].map((n) => (
                      <option key={n} value={n}>{n} Questions</option>
                    ))}
                  </select>
                </div>

                <div
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                    isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <div>
                    <div className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Default Theory Count</div>
                    <div className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>Open-ended essay questions per session</div>
                  </div>
                  <select
                    value={defaultTheory}
                    onChange={(e) => setDefaultTheory(Number(e.target.value))}
                    className={`border rounded-lg px-3 py-1.5 text-xs font-medium outline-none min-h-[36px] ${
                      isDark ? "bg-zinc-900 border-zinc-700 text-zinc-200 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                    }`}
                  >
                    {[0, 2, 3, 5, 8].map((n) => (
                      <option key={n} value={n}>{n} Theory Qs</option>
                    ))}
                  </select>
                </div>

                <div
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                    isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <div>
                    <div className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Auto-Save Assessments</div>
                    <div className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>Automatically save completed tests to device vault</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-inherit">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`px-4 py-2 min-h-[40px] text-xs font-semibold transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Back
                </button>
                <button
                  id="btn-wizard-finish"
                  type="button"
                  onClick={handleFinish}
                  className="flex items-center gap-1.5 px-5 py-2.5 min-h-[42px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Finish Setup & Launch</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
