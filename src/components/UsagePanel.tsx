import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { getUsageSummary } from "../lib/api";
import { AppTheme, UsageSummary } from "../types";

interface UsagePanelProps {
  theme?: AppTheme;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({ theme = "red-light" }) => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";

  useEffect(() => {
    getUsageSummary()
      .then((res) => setSummary(res.summary))
      .catch(() => setError("Usage data unavailable."));
  }, []);

  if (error) {
    return <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{error}</p>;
  }
  if (!summary) {
    return <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Loading usage…</p>;
  }

  const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const fmtCost = (n: number) => (n === 0 ? "$0.00" : `$${n.toFixed(4)}`);

  return (
    <div className="space-y-2.5 pt-3 border-t border-inherit">
      <label className="text-xs font-bold flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-red-600" />
        API Usage & Cost
      </label>

      {summary.freeTier?.warning && (
        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Free-tier daily limit approaching: {summary.freeTier.requestsToday} of {summary.freeTier.rpd} requests used today.
            You may start seeing rate-limit errors — consider generating quizzes later or switching models.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
          <div className="font-bold">Today</div>
          <div className={`mt-1 space-y-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <div>{summary.today.requests} requests ({summary.today.failedRequests} failed)</div>
            <div>{fmtTokens(summary.today.inputTokens)} in / {fmtTokens(summary.today.outputTokens)} out tokens</div>
            <div>{fmtCost(summary.today.estCostUsd)} estimated</div>
          </div>
        </div>
        <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-[#09090b] border-zinc-800" : "bg-zinc-50 border-zinc-200"}`}>
          <div className="font-bold">This month</div>
          <div className={`mt-1 space-y-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <div>{summary.month.requests} requests</div>
            <div>{fmtTokens(summary.month.inputTokens)} in / {fmtTokens(summary.month.outputTokens)} out tokens</div>
            <div>{fmtCost(summary.month.estCostUsd)} estimated</div>
          </div>
        </div>
      </div>

      {summary.perModel.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className={`text-left ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              <th className="py-1 font-semibold">Model</th>
              <th className="py-1 font-semibold text-right">Requests</th>
              <th className="py-1 font-semibold text-right">Tokens</th>
              <th className="py-1 font-semibold text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {summary.perModel.map((m) => (
              <tr key={m.model} className={isDark ? "text-zinc-300" : "text-zinc-600"}>
                <td className="py-1 font-mono">{m.model}</td>
                <td className="py-1 text-right">{m.requests}</td>
                <td className="py-1 text-right">{fmtTokens(m.inputTokens + m.outputTokens)}</td>
                <td className="py-1 text-right">{fmtCost(m.estCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
