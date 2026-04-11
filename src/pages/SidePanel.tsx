import { useState, useRef, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { Markdown } from "@/components/Markdown";
import { InteractionTimeline } from "@/components/InteractionTimeline";
import { generateSessionRecap } from "@/services/notes-generator";
import { MessageSquare, History, BookOpen, Loader2, Settings, Send } from "lucide-react";

type Tab = "current" | "history" | "notes";

function SettingsPanel({
  apiKey,
  onSave,
}: {
  apiKey: string;
  onSave: (key: string) => void;
}) {
  const [draft, setDraft] = useState(apiKey);

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-200">Settings</h3>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">OpenAI API Key</label>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-lg px-3 py-2 text-sm text-white bg-zinc-800 border border-zinc-700 outline-none focus:border-emerald-500/50"
        />
      </div>
      <button
        onClick={() => onSave(draft)}
        className="w-full py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
      >
        Save
      </button>
      <p className="text-xs text-zinc-500">
        Your key is stored locally and used for Whisper STT, GPT-4o, and TTS. It syncs to the overlay bar automatically.
      </p>
    </div>
  );
}

export default function SidePanel() {
  const {
    apiKey,
    setApiKey,
    currentResponse,
    interactions,
    tts,
    isStreaming,
    streamedResponse,
    askQuestion,
  } = useApp();

  const [tab, setTab] = useState<Tab>("current");
  const [showSettings, setShowSettings] = useState(!apiKey);
  const [recapContent, setRecapContent] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-check API key to auto-dismiss settings if it was set
  useEffect(() => {
    if (apiKey && showSettings) setShowSettings(false);
  }, [apiKey]);

  useEffect(() => {
    if (scrollRef.current && (isStreaming || currentResponse)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamedResponse, currentResponse]);

  useEffect(() => {
    if (currentResponse || isStreaming) setTab("current");
  }, [currentResponse, isStreaming]);

  const handleRecap = async () => {
    if (!apiKey) return;
    setRecapLoading(true);
    setTab("notes");
    try {
      const recap = await generateSessionRecap(apiKey);
      setRecapContent(recap);
    } catch {
      setRecapContent("Failed to generate recap. Please try again.");
    }
    setRecapLoading(false);
  };

  const handleManualAsk = () => {
    if (!manualInput.trim()) return;
    askQuestion(manualInput.trim());
    setManualInput("");
  };

  if (showSettings) {
    return (
      <div className="h-screen bg-zinc-950 text-white flex flex-col">
        <div className="h-10 flex items-center px-4" data-tauri-drag-region>
          <span className="text-sm font-semibold pl-16">Hey TA — Setup</span>
        </div>
        <SettingsPanel
          apiKey={apiKey}
          onSave={(key) => {
            setApiKey(key);
            setShowSettings(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-white flex flex-col">
      {/* Title bar */}
      <div className="h-10 flex items-center justify-between px-4 shrink-0" data-tauri-drag-region>
        <span className="text-sm font-semibold pl-16">Hey TA</span>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
        >
          <Settings className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-4 shrink-0">
        {([
          { id: "current", icon: MessageSquare, label: "Current" },
          { id: "history", icon: History, label: "History" },
          { id: "notes", icon: BookOpen, label: "Notes" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              if (id === "notes" && !recapContent && !recapLoading) handleRecap();
            }}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Tip banner */}
        <div className="px-4 pt-3 pb-1">
          <div className="text-[11px] text-zinc-500 bg-zinc-900/50 rounded-lg px-3 py-2">
            Use the overlay bar to control camera, mic, and screen capture. Type a question below or say "Hey TA" with the mic on.
          </div>
        </div>

        {tab === "current" && (
          <div className="p-4">
            {isStreaming ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Generating response...</span>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-4">
                  <Markdown>{streamedResponse}</Markdown>
                </div>
              </div>
            ) : currentResponse ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-emerald-400">Spoken Hint</span>
                    <button
                      onClick={() => tts.speak(currentResponse.spoken_blurb)}
                      className="text-xs text-emerald-400/60 hover:text-emerald-400 transition-colors"
                    >
                      ▶ Replay
                    </button>
                  </div>
                  <p className="text-sm text-zinc-200">{currentResponse.spoken_blurb}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-zinc-400 mb-2 block">Detailed Explanation</span>
                  <div className="bg-zinc-900/50 rounded-lg p-4">
                    <Markdown>{currentResponse.written_explanation}</Markdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-emerald-500/50" />
                </div>
                <p className="text-sm font-medium">Ready to help</p>
                <p className="text-xs text-center max-w-xs">
                  Say "Hey TA" followed by your question, or type below.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="p-4">
            <InteractionTimeline
              interactions={interactions}
              onReplay={(text) => tts.speak(text)}
            />
          </div>
        )}

        {tab === "notes" && (
          <div className="p-4">
            {recapLoading ? (
              <div className="flex items-center gap-2 py-12 justify-center text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Generating session recap...</span>
              </div>
            ) : recapContent ? (
              <div className="bg-zinc-900/50 rounded-lg p-4">
                <Markdown>{recapContent}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-zinc-500">
                <p className="text-sm">No recap yet</p>
                <button onClick={handleRecap} className="mt-3 text-xs text-emerald-400 hover:text-emerald-300">
                  Generate Recap
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleManualAsk();
              }
            }}
            placeholder={apiKey ? "Type a question..." : "Enter API key in settings first"}
            disabled={!apiKey}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder-zinc-500 disabled:opacity-40"
          />
          <button
            onClick={handleManualAsk}
            disabled={!manualInput.trim() || isStreaming || !apiKey}
            className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
