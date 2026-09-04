import React, { useEffect, useState } from "react";
import { BookOpen, History, Settings, Plus, Sun, Moon } from "lucide-react";
import { UserPreferences, AppTheme } from "../types";
import { checkBackendHealth } from "../lib/api";

interface HeaderProps {
  preferences: UserPreferences;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onNewQuiz: () => void;
  onToggleTheme?: (theme: AppTheme) => void;
  onThemeChange?: (theme: AppTheme) => void;
  historyCount: number;
  currentView: "create" | "quiz" | "results";
}

export const Header: React.FC<HeaderProps> = ({
  preferences,
  onOpenSettings,
  onOpenHistory,
  onNewQuiz,
  onToggleTheme,
  onThemeChange,
  historyCount,
  currentView,
}) => {
  const [serverHasProvider, setServerHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendHealth()
      .then((health) => setServerHasProvider(Boolean(Object.values(health.providers ?? {}).some(Boolean))))
      .catch(() => setServerHasProvider(null));
  }, []);

  const hasKey = serverHasProvider === true;
  const currentTheme = preferences.theme || "red-light";
  const isDark = currentTheme === "black-red-dark" || currentTheme === "carbon-dark";

  const handleThemeSwitch = (nextTheme: AppTheme) => {
    if (typeof onToggleTheme === "function") {
      onToggleTheme(nextTheme);
    } else if (typeof onThemeChange === "function") {
      onThemeChange(nextTheme);
    }
  };

  const cycleTheme = () => {
    if (isDark) {
      handleThemeSwitch("red-light");
    } else {
      handleThemeSwitch("black-red-dark");
    }
  };

  return (
    <header
      id="edublaxk-header"
      className={`sticky top-0 z-30 w-full border-b transition-colors duration-200 backdrop-blur-md ${
        isDark
          ? "bg-[#09090b]/95 border-[#27272a] text-[#f4f4f5]"
          : "bg-white/95 border-zinc-200 text-zinc-900"
      }`}
    >
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Brand */}
        <div
          onClick={onNewQuiz}
          className="flex items-center gap-1.5 sm:gap-2 cursor-pointer select-none group min-h-[40px] shrink-0"
          id="btn-brand-home"
        >
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              isDark
                ? "bg-red-950/60 border border-red-800/80 text-red-500 group-hover:border-red-500"
                : "bg-red-50 border border-red-200 text-red-600 group-hover:bg-red-100"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-sm sm:text-base tracking-tight font-sans whitespace-nowrap">
              Edu<span className="text-red-600 font-extrabold">BLAXK</span>
            </span>
            <span
              className={`text-[9px] sm:text-[10px] font-medium hidden md:inline px-1.5 py-0.5 rounded-full border ${
                isDark
                  ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                  : "bg-zinc-100 border-zinc-200 text-zinc-600"
              }`}
            >
              AI Tutor
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {currentView !== "create" && (
            <button
              id="btn-new-quiz-nav"
              onClick={onNewQuiz}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 min-h-[34px] sm:min-h-[36px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 ${
                isDark
                  ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-xs"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="hidden sm:inline">New Test</span>
              <span className="sm:hidden text-[11px]">New</span>
            </button>
          )}

          <button
            id="btn-open-history"
            onClick={onOpenHistory}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 min-h-[34px] sm:min-h-[36px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 ${
              isDark
                ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-xs"
            }`}
          >
            <History className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="hidden xs:inline sm:inline text-[11px] sm:text-xs">Vault</span>
            {historyCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  isDark ? "bg-red-950 text-red-400 border border-red-800" : "bg-red-100 text-red-700"
                }`}
              >
                {historyCount}
              </span>
            )}
          </button>

          {/* Theme Switcher */}
          <button
            id="btn-toggle-theme"
            onClick={cycleTheme}
            className={`flex items-center justify-center p-2 sm:px-2.5 sm:py-1.5 min-h-[34px] sm:min-h-[36px] min-w-[34px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 ${
              isDark
                ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-red-400"
                : "bg-white hover:bg-zinc-50 border-zinc-200 text-red-600 shadow-xs"
            }`}
            title={`Current theme: ${isDark ? "Black & Red Dark" : "Red Light"}. Click to toggle.`}
          >
            {isDark ? (
              <Moon className="w-3.5 h-3.5 text-red-500 fill-red-500/20 shrink-0" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            <span className="hidden md:inline text-[11px] ml-1">
              {isDark ? "Dark" : "Light"}
            </span>
          </button>

          {/* Settings */}
          <button
            id="btn-open-settings"
            onClick={onOpenSettings}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 min-h-[34px] sm:min-h-[36px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 ${
              isDark
                ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-xs"
            }`}
            title={serverHasProvider === null ? "Server status unknown (offline?)" : hasKey ? "API key ready on server" : "API key needed — open Settings"}
          >
            <Settings className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="hidden sm:inline">Settings</span>
            <div className="flex items-center ml-0.5 shrink-0">
              <div
                className={`w-2 h-2 rounded-full ${
                  hasKey ? "bg-emerald-500" : serverHasProvider === null ? "bg-zinc-400" : "bg-red-500 animate-pulse"
                }`}
                title={hasKey ? "API key ready" : serverHasProvider === null ? "Server offline/unknown" : "API key needed"}
              />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
