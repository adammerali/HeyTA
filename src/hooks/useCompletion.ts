/**
 * useCompletion Hook — useReducer-based state machine for the AI completion flow.
 *
 * Extracts the `askQuestion` orchestration logic from AppContext into a standalone
 * hook with explicit state transitions. The reducer makes every state change
 * traceable: START_THINKING → STREAM_CHUNK* → COMPLETE | SKIP | ERROR → RESET.
 *
 * ## Why a reducer instead of scattered useState calls?
 *
 * The completion flow has 5 pieces of correlated state (status, response,
 * streamed text, streaming flag, error). With individual `useState` calls these
 * can momentarily diverge during React's batching boundaries, causing flicker
 * or impossible state combinations (e.g., `isStreaming=true` + `status=idle`).
 * A single dispatch atomically transitions all fields together.
 */

import { useReducer, useCallback, useRef } from "react";
import type { TutoringResponse, Interaction, ConversationEntry } from "@/types";
import { streamAIResponse } from "@/services/ai-response";
import { buildMessages, getDefaultModel } from "@/services/context-builder";
import { logInteraction, getSessionHistory, startSession, getCurrentSessionId } from "@/services/session-logger";
import { parseTutoringResponse } from "@/lib/utils";
import { getBestFrame } from "@/services/workspace-compositor";
import type { useTTS } from "@/hooks/useTTS";

// ---------------------------------------------------------------------------
// State & Action types
// ---------------------------------------------------------------------------

/** The full state managed by the completion reducer. */
export interface CompletionState {
  /** Current phase of the completion flow. */
  status: "idle" | "thinking" | "speaking" | "error";
  /** Parsed tutoring response after streaming completes, `null` before COMPLETE. */
  currentResponse: TutoringResponse | null;
  /** Accumulated raw text from the model during streaming. */
  streamedResponse: string;
  /** `true` while the async generator is yielding chunks. */
  isStreaming: boolean;
  /** Human-readable error message when `status` is `"error"`. */
  error: string | null;
}

/** Discriminated union of every action the completion reducer handles. */
export type CompletionAction =
  | { type: "START_THINKING" }
  | { type: "STREAM_CHUNK"; chunk: string }
  | { type: "COMPLETE"; response: TutoringResponse }
  | { type: "SKIP" }
  | { type: "ERROR"; error: string }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: CompletionState = {
  status: "idle",
  currentResponse: null,
  streamedResponse: "",
  isStreaming: false,
  error: null,
};

/**
 * Pure reducer that enforces valid state transitions for the completion flow.
 *
 * Transition diagram:
 * ```
 * idle ──START_THINKING──▶ thinking ──STREAM_CHUNK*──▶ thinking
 *                                   ──COMPLETE──────▶ speaking ──RESET──▶ idle
 *                                   ──SKIP──────────▶ idle
 *                                   ──ERROR─────────▶ error ────RESET──▶ idle
 * ```
 */
export function completionReducer(
  state: CompletionState,
  action: CompletionAction,
): CompletionState {
  switch (action.type) {
    case "START_THINKING":
      return {
        ...initialState,
        status: "thinking",
        isStreaming: true,
      };

    case "STREAM_CHUNK":
      return {
        ...state,
        streamedResponse: state.streamedResponse + action.chunk,
      };

    case "COMPLETE":
      return {
        ...state,
        status: "speaking",
        currentResponse: action.response,
        isStreaming: false,
      };

    case "SKIP":
      return { ...initialState };

    case "ERROR":
      return {
        ...state,
        status: "error",
        isStreaming: false,
        error: action.error,
      };

    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Parameters required by {@link useCompletion}. */
export interface UseCompletionParams {
  /** OpenAI API key for both chat completion and TTS. */
  apiKey: string;
  /** TTS hook instance (from {@link useTTS}) used to speak the blurb aloud. */
  tts: ReturnType<typeof useTTS>;
  /** Optional base64 PNG of the user-selected problem screenshot. */
  problemScreenshot: string | null;
}

/**
 * Manages the full AI completion lifecycle with a deterministic state machine.
 *
 * Orchestrates: frame capture → message building → streaming → parsing → TTS → logging.
 *
 * @param params - API key, TTS hook, and optional problem screenshot
 * @returns `{ state, askQuestion, interactions }` — the state machine output,
 *          a function to kick off a new completion, and the session history
 *
 * @example
 * ```tsx
 * const { state, askQuestion, interactions } = useCompletion({
 *   apiKey, tts, problemScreenshot,
 * });
 *
 * // Trigger from a voice transcript:
 * askQuestion("How do I factor x² - 9?");
 *
 * // Read current phase:
 * state.status; // "idle" | "thinking" | "speaking" | "error"
 * ```
 */
export function useCompletion({ apiKey, tts, problemScreenshot }: UseCompletionParams) {
  const [state, dispatch] = useReducer(completionReducer, initialState);

  const abortRef = useRef<AbortController | null>(null);
  const conversationHistoryRef = useRef<ConversationEntry[]>([]);
  const busyRef = useRef(false);
  const interactionsRef = useRef<Interaction[]>([]);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!apiKey || !question.trim()) return;

      if (busyRef.current) {
        console.log("[HeyTA] Skipping — already processing a response");
        return;
      }

      if (!getCurrentSessionId()) {
        startSession();
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      busyRef.current = true;

      dispatch({ type: "START_THINKING" });

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
          dispatch({ type: "STREAM_CHUNK", chunk });
        }

        if (abortRef.current?.signal.aborted) return;

        const parsed = parseTutoringResponse(fullText);

        if (!parsed.spoken_blurb.trim()) {
          console.log("[HeyTA] Model chose not to respond (ambient speech)");
          dispatch({ type: "SKIP" });
          busyRef.current = false;
          return;
        }

        dispatch({ type: "COMPLETE", response: parsed });
        tts.speak(parsed.spoken_blurb);

        logInteraction({
          userQuestion: question,
          spokenResponse: parsed.spoken_blurb,
          writtenResponse: parsed.written_explanation,
          workspaceSnapshot: workspaceImage || undefined,
          screenshot: problemScreenshot || undefined,
        });

        interactionsRef.current = getSessionHistory();

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
          dispatch({ type: "ERROR", error: String((err as Error)?.message || err) });
        }
      } finally {
        busyRef.current = false;
        setTimeout(() => dispatch({ type: "RESET" }), 3000);
      }
    },
    [apiKey, problemScreenshot, tts],
  );

  return {
    state,
    askQuestion,
    interactions: interactionsRef.current,
  };
}
