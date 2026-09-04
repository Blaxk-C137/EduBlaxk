import React, { useState } from "react";
import { X, Send, Bot, HelpCircle, Loader2 } from "lucide-react";
import { Question, TutorChatMessage, AppTheme } from "../types";
import { askAiTutor } from "../lib/api";

interface AskTutorDrawerProps {
  isOpen: boolean;
  question: Question | null;
  theme?: AppTheme;
  onClose: () => void;
}

export const AskTutorDrawer: React.FC<AskTutorDrawerProps> = ({
  isOpen,
  question,
  theme = "red-light",
  onClose,
}) => {
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isDark = theme === "black-red-dark" || theme === "carbon-dark";
  const isLight = !isDark;

  if (!isOpen || !question) return null;

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage.trim();
    const newUserMsg: TutorChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...messages, newUserMsg];
    setMessages(updatedHistory);
    setInputMessage("");
    setIsLoading(true);

    try {
      const reply = await askAiTutor({
        questionContext: {
          question: question.question,
          explanation: question.explanation,
          sourceContext: question.sourceContext,
        },
        chatHistory: updatedHistory,
        userMessage: userText,
      });

      const assistantMsg: TutorChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      };
      setMessages([...updatedHistory, assistantMsg]);
    } catch (err: any) {
      const errorMsg: TutorChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: err?.message || "Sorry, I encountered an issue replying. Please verify your Gemini API key in Settings.",
        timestamp: new Date().toISOString(),
      };
      setMessages([...updatedHistory, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="tutor-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="tutor-drawer"
        className={`w-full max-w-lg h-full flex flex-col shadow-2xl border-l animate-in slide-in-from-right duration-200 transition-all ${
          isDark
            ? "bg-[#121215] border-[#27272a] text-[#f4f4f5]"
            : "bg-white border-zinc-200 text-zinc-900"
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b border-inherit flex items-center justify-between ${isDark ? "bg-[#09090b]" : "bg-zinc-50"}`}>
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
              }`}
            >
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Academic AI Tutor</h3>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Step-by-step conceptual walkthroughs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
              isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Question Context Snippet */}
        <div
          className={`p-3.5 border-b border-inherit text-xs space-y-1 ${
            isDark ? "bg-[#09090b] text-zinc-200" : "bg-zinc-50 text-zinc-800"
          }`}
        >
          <div className={`text-[10px] uppercase font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>Active Question Context</div>
          <p className="line-clamp-2 leading-relaxed font-medium">
            {question.question}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div
                className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center ${
                  isDark ? "bg-red-950/60 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Have questions about this concept?
              </div>
              <p className={`text-xs max-w-xs mx-auto leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Ask for an intuitive breakdown, a real-world example, or why alternative answers don't apply.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                {[
                  "Explain this with a simple analogy",
                  "Why is this the correct solution?",
                  "Give me a step-by-step example",
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInputMessage(prompt)}
                    className={`text-xs px-3 py-2 min-h-[38px] rounded-xl border transition-all cursor-pointer ${
                      isDark
                        ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300"
                        : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-xs"
                    }`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 text-xs ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isDark ? "bg-red-950 text-red-400 border border-red-900" : "bg-red-50 text-red-600 border border-red-200"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-3.5 rounded-2xl max-w-[85%] leading-relaxed break-words whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-red-600 text-white font-medium shadow-xs"
                      : isDark
                      ? "bg-[#09090b] border border-zinc-800 text-zinc-200"
                      : "bg-zinc-100/90 text-zinc-800 border border-zinc-200"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className={`flex gap-2.5 text-xs items-center ${isDark ? "text-red-400" : "text-red-600"}`}>
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-red-950/60" : "bg-red-50"}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
              <span className="text-xs font-medium">Formulating pedagogical response...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className={`p-4 border-t border-inherit ${isDark ? "bg-[#09090b]" : "bg-zinc-50"}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask a clarifying question..."
              className={`flex-1 border rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors min-h-[42px] ${
                isDark
                  ? "bg-[#18181b] border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-red-500"
                  : "bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-red-600"
              }`}
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="p-2.5 min-h-[42px] min-w-[42px] flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
