/**
 * AppContext — Global Application State and Orchestration
 *
 * ## Responsibility
 *
 * This context is the central orchestration point that coordinates:
 * - API key management (cross-window sync via localStorage)
 * - Camera lifecycle (useCamera hook)
 * - TTS playback (useTTS hook)
 * - AI question/response flow (streaming, parsing, logging)
 * - Conversation history (rolling window for follow-up context)
 * - Session logging (interactions for timeline and recap)
 *
 * ## Design Decision: Single Context vs. Multiple Contexts
 *
 * We use a single AppContext rather than splitting into CameraContext,
 * VoiceContext, etc. because the tutoring flow is tightly coupled:
 * asking a question requires camera frame + API key + conversation history.
 * Splitting would require cross-context coordination that adds complexity
 * without meaningful separation of concerns.
 *
 * ## Conversation History Window
 *
 * We maintain a rolling window of up to 10 conversation entries. The context
 * builder uses the last 3 for the GPT-4o prompt (keeping it under 8K tokens),
 * but we store 10 so the interaction timeline has more history to display.
 *
 * ## Streaming Flow
 *
 * The `askQuestion` flow:
 * 1. Abort any in-flight request (AbortController)
 * 2. Get the best stable webcam frame from the compositor
 * 3. Build the multimodal message array
 * 4. Stream the response via async generator
 * 5. Parse the JSON response (spoken_blurb + written_explanation)
 * 6. Speak the blurb via TTS
 * 7. Log the interaction for timeline and recap
 */

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

  // Cross-window API key synchronization (see useApiKeySync for full explanation)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "heyta_api_key" && e.newValue !== null) {
        setApiKeyState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);

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

  /**
   * Core tutoring flow — ask a question and stream the AI response.
   *
   * This is the heart of Hey TA: it assembles context from all sources
   * (camera, screenshot, history, transcript), streams the response,
   * parses the dual-output format, speaks the hint, and logs everything.
   */
  const askQuestion = useCallback(
    async (question: string) => {
      if (!apiKey || !question.trim()) return;

      // Auto-start session on first question
      if (!getCurrentSessionId()) {
        startSession();
      }

      // Abort any in-flight request to prevent overlapping responses
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setStatus("thinking");
      setIsStreaming(true);
      setStreamedResponse("");
      setCurrentResponse(null);

      // Get the best stable frame from the compositor's rolling buffer
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
        // Stream tokens from GPT-4o and update the UI progressively
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

        // Parse the model's JSON response into spoken + written components.
        // parseTutoringResponse has 5 fallback strategies for robustness.
        const parsed = parseTutoringResponse(fullText);
        setCurrentResponse(parsed);

        // Speak the short hint immediately for fast perceived response
        setStatus("speaking");
        tts.speak(parsed.spoken_blurb);

        // Log the interaction for the timeline and future recap generation
        logInteraction({
          userQuestion: question,
          spokenResponse: parsed.spoken_blurb,
          writtenResponse: parsed.written_explanation,
          workspaceSnapshot: workspaceImage || undefined,
          screenshot: problemScreenshot || undefined,
        });

        setInteractions(getSessionHistory());

        // Add to conversation history for follow-up context
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
        // Return to idle after 3 seconds (gives "speaking" status time to display)
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
