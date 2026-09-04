import React, { useEffect, useState, useRef } from "react";
import { X, Key, CheckCircle2, AlertCircle, Trash2, Download, Upload, ExternalLink, HardDrive, Eye, EyeOff, Sliders, Cpu } from "lucide-react";
import { UserPreferences, AppTheme, ModelInfo, ServerConfig } from "../types";
import { getModels, getServerConfig, saveProviderKey, setActiveModel } from "../lib/api";
import { exportVaultJSON, importVaultJSON, clearAllStoredData } from "../lib/storage";
import { UsagePanel } from "./UsagePanel";

interface SettingsModalProps {
  isOpen: boolean;
  preferences: UserPreferences;
  theme?: AppTheme;
  onSavePreferences: (prefs: Partial<UserPreferences>) => void;
  onClose: () => void;
  onRefreshVault: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  preferences,
  theme = "red-light",
  onSavePreferences,
  onClose,
  onRefreshVault,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("google");
  const [selectedModel, setSelectedModel] = useState<string>(preferences.preferredModel || "");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [defaultMcq, setDefaultMcq] = useState(preferences.defaultMcqCount || 10);
  const [defaultTheory, setDefaultTheory] = useState(preferences.defaultTheoryCount || 3);
  const [defaultDifficulty, setDefaultDifficulty] = useState(preferences.defaultDifficulty || "Intermediate");
  const [autoSave, setAutoSave] = useState(preferences.autoSaveToVault !== false);

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;

  if (!isOpen) return null;

  useEffect(() => {
    getModels()
      .then((list) => {
        setModels(list);
        const initial = preferences.preferredModel || list.find((m) => m.hasKey)?.id || "google:gemini-2.5-flash";
        setSelectedModel(initial);
        setSelectedProvider(initial.split(":")[0]);
      })
      .catch(() => setModels([]));
    getServerConfig().then(setServerConfig).catch(() => setServerConfig(null));
  }, [preferences.preferredModel]);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyStatus({ success: false, message: "Paste your API key first." });
      return;
    }
    setIsSavingKey(true);
    setKeyStatus(null);
    try {
      const res = await saveProviderKey(selectedProvider, apiKeyInput.trim());
      setKeyStatus({ success: true, message: res.message });
      setApiKeyInput("");
      const list = await getModels();
      setModels(list);
      setServerConfig(await getServerConfig());
    } catch (err: any) {
      setKeyStatus({ success: false, message: err.message || "Failed to save API key." });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSave = () => {
    onSavePreferences({
      defaultMcqCount: defaultMcq,
      defaultTheoryCount: defaultTheory,
      defaultDifficulty,
      preferredModel: selectedModel || undefined,
      autoSaveToVault: autoSave,
    });
    if (selectedModel) setActiveModel(selectedModel).catch(() => {});
    onClose();
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear your local assessment history? This cannot be undone.")) {
      clearAllStoredData();
      onRefreshVault();
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importVaultJSON(content);
        setImportStatus(result.message);
        if (result.success) {
          onRefreshVault();
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      id="settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="settings-modal"
        className={`w-full max-w-xl border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 text-zinc-900 shadow-xl"
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
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">EduBLAXK Preferences</h3>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                AI Provider, Models & Local Storage Settings
              </p>
            </div>
          </div>
          <button
            id="btn-close-settings"
            onClick={onClose}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
              isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Provider & API Key */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-red-600" />
                AI Provider & API Key
              </label>
              <a
                href={selectedProvider === "google" ? "https://aistudio.google.com/app/apikey" : selectedProvider === "anthropic" ? "https://console.anthropic.com/settings/keys" : "https://platform.openai.com/api-keys"}
                target="_blank"
                rel="noreferrer"
                className={`text-[11px] hover:underline flex items-center gap-1 font-semibold ${isDark ? "text-red-400" : "text-red-600"}`}
              >
                <span>Get API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
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
              {["google", "anthropic", "openai"].map((p) => (
                <option key={p} value={p}>
                  {p === "google" ? "Google Gemini (free tier available)" : p === "anthropic" ? "Anthropic Claude" : "OpenAI"}
                  {serverConfig?.providers?.[p] ? " ✓ key saved" : ""}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                id="input-settings-api-key"
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setKeyStatus(null);
                }}
                placeholder="Paste API key (saved on this computer, not the browser)"
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

            {keyStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  keyStatus.success
                    ? isDark ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : isDark ? "bg-red-950/40 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {keyStatus.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                )}
                <span>{keyStatus.message}</span>
              </div>
            )}
          </div>

          {/* Section 2: Model Selection */}
          <div className="space-y-2 pt-3 border-t border-inherit">
            <label className="text-xs font-bold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-red-600" />
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={`w-full border rounded-xl px-3.5 py-2 text-xs font-medium outline-none min-h-[42px] ${
                isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
              }`}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerLabel} — {m.label}
                  {m.freeTier ? " (free tier)" : ` ($${m.pricing.input}/$${m.pricing.output} per MTok)`}
                  {m.hasKey ? " ✓" : ""}
                </option>
              ))}
            </select>
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              If a model is overloaded, EduBLAXK retries once, then falls back to a same-or-cheaper model — never to a pricier tier.
            </p>
          </div>

          <UsagePanel theme={theme} />

          {/* Section 3: Default Assessment Settings */}
          <div className="space-y-3 pt-3 border-t border-inherit">
            <label className="text-xs font-bold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-red-600" />
              Default Assessment Parameters
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>Default MCQs:</span>
                <select
                  value={defaultMcq}
                  onChange={(e) => setDefaultMcq(Number(e.target.value))}
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-medium outline-none min-h-[40px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  {[5, 10, 15, 20, 30].map((n) => (
                    <option key={n} value={n}>{n} Questions</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>Default Theory Qs:</span>
                <select
                  value={defaultTheory}
                  onChange={(e) => setDefaultTheory(Number(e.target.value))}
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-medium outline-none min-h-[40px] ${
                    isDark ? "bg-[#09090b] border-zinc-800 text-zinc-100 focus:border-red-500" : "bg-white border-zinc-200 text-zinc-800 focus:border-red-600"
                  }`}
                >
                  {[0, 2, 3, 5, 8].map((n) => (
                    <option key={n} value={n}>{n} Theory Qs</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Vault & Local Data */}
          <div className="space-y-3 pt-3 border-t border-inherit">
            <label className="text-xs font-bold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-red-600" />
              Local Storage Vault Actions
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportVaultJSON}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                    : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700"
                }`}
              >
                <Download className="w-3.5 h-3.5 text-red-600" />
                <span>Export Vault JSON</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200"
                    : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700"
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-red-600" />
                <span>Import JSON</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".json"
                className="hidden"
              />

              <button
                type="button"
                onClick={handleClearHistory}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? "bg-red-950/40 hover:bg-red-900/60 border-red-900 text-red-300"
                    : "bg-red-50 hover:bg-red-100 border-red-200 text-red-700"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Vault</span>
              </button>
            </div>

            {importStatus && (
              <p className={`text-[11px] font-mono ${isDark ? "text-red-400" : "text-red-600"}`}>{importStatus}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-inherit ${isDark ? "bg-[#09090b]" : "bg-zinc-50"}`}>
          <button
            id="btn-cancel-settings"
            type="button"
            onClick={onClose}
            className={`px-4 py-2 min-h-[40px] text-xs font-semibold rounded-xl transition cursor-pointer ${
              isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Cancel
          </button>
          <button
            id="btn-save-settings"
            type="button"
            onClick={handleSave}
            className="px-5 py-2 min-h-[40px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
