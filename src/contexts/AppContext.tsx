import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { AppStatus, TutoringResponse, Interaction, ConversationEntry } from "@/types";
import { useCamera } from "@/hooks/useCamera";
import { useTTS } from "@/hooks/useTTS";
import { streamAIResponse } from "@/services/ai-response";
import { buildMessages, getDefaultModel } from "@/services/context-builder";
import { logInteraction, getSessionHistory, startSession, getCurrentSessionId } from "@/services/session-logger";
import { parseTutoringResponse } from "@/lib/utils";
import { getBestFrame } from "@/services/workspace-compositor";

interface AppContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  status: AppStatus;
  currentResponse: TutoringResponse | null;
  interactions: Interaction[];
  camera: ReturnType<typeof useCamera>;
  tts: ReturnType<typeof useTTS>;
  problemScreenshot: string | null;
  setProblemScreenshot: (s: string | null) => void;
  askQuestion: (question: string) => Promise<void>;
  isStreaming: boolean;
  streamedResponse: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem("heyta_api_key") || "");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [currentResponse, setCurrentResponse] = useState<TutoringResponse | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [problemScreenshot, setProblemScreenshot] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const conversationHistoryRef = useRef<ConversationEntry[]>([]);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem("heyta_api_key", key);
  }, []);

  // Sync API key across windows via storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "heyta_api_key" && e.newValue !== null) {
        setApiKeyState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);

    // Also poll for changes (storage events don't fire in same window)
    const interval = setInterval(() => {
      const stored = localStorage.getItem("heyta_api_key") || "";
      setApiKeyState((prev) => (stored !== prev ? stored : prev));
    }, 2000);

    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  const camera = useCamera();
  const tts = useTTS(apiKey);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!apiKey || !question.trim()) return;

      if (!getCurrentSessionId()) {
        startSession();
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setStatus("thinking");
      setIsStreaming(true);
      setStreamedResponse("");
      setCurrentResponse(null);

      const workspaceImage = getBestFrame();

      const messages = buildMessages({
        userQuestion: question,
        workspaceImage,
        problemImage: problemScreenshot,
        recentTranscripts: [],
        conversationHistory: conversationHistoryRef.current,
      });

      let fullText = "";
      try {
        for await (const chunk of streamAIResponse({
          apiKey,
          messages,
          model: getDefaultModel(),
          signal: abortRef.current.signal,
        })) {
          if (abortRef.current?.signal.aborted) break;
          fullText += chunk;
          setStreamedResponse(fullText);
        }

        if (abortRef.current?.signal.aborted) return;

        const parsed = parseTutoringResponse(fullText);
        setCurrentResponse(parsed);

        setStatus("speaking");
        tts.speak(parsed.spoken_blurb);

        logInteraction({
          userQuestion: question,
          spokenResponse: parsed.spoken_blurb,
          writtenResponse: parsed.written_explanation,
          workspaceSnapshot: workspaceImage || undefined,
          screenshot: problemScreenshot || undefined,
        });

        setInteractions(getSessionHistory());

        conversationHistoryRef.current.push({
          role: "user",
          question,
          spokenBlurb: parsed.spoken_blurb,
          writtenExplanation: parsed.written_explanation,
          timestamp: Date.now(),
        });
        if (conversationHistoryRef.current.length > 10) {
          conversationHistoryRef.current.shift();
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("AI response error:", err);
          setStatus("error");
          return;
        }
      } finally {
        setIsStreaming(false);
        setTimeout(() => setStatus((s) => (s === "error" ? s : "idle")), 3000);
      }
    },
    [apiKey, problemScreenshot, tts],
  );

  return (
    <AppContext.Provider
      value={{
        apiKey,
        setApiKey,
        status,
        currentResponse,
        interactions,
        camera,
        tts,
        problemScreenshot,
        setProblemScreenshot,
        askQuestion,
        isStreaming,
        streamedResponse,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
