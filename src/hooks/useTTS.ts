/**
 * useTTS Hook — Text-to-Speech React Integration
 *
 * Wraps the TTS service with React state management for `isSpeaking` status.
 * The `speakingRef` mirror prevents stale closure issues in callbacks that
 * need to check speaking status synchronously (e.g., status bar display).
 *
 * ## Design Decision: Hook vs. Direct Service Calls
 *
 * Components could call `tts.speak()` directly, but this hook provides:
 * 1. React-managed `isSpeaking` state that triggers re-renders
 * 2. Automatic cleanup (stop on unmount is handled by the service)
 * 3. API key propagation from context without each component needing it
 */

import { useState, useCallback, useRef } from "react";
import { speak as ttsSpeak, stop as ttsStop } from "@/services/tts";

export function useTTS(apiKey: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingRef = useRef(false);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim() || !apiKey) return;

      ttsStop(); // Stop any currently playing audio first
      setIsSpeaking(true);
      speakingRef.current = true;

      try {
        await ttsSpeak(text, apiKey);
      } catch (err) {
        console.error("TTS error:", err);
      } finally {
        setIsSpeaking(false);
        speakingRef.current = false;
      }
    },
    [apiKey],
  );

  const stop = useCallback(() => {
    ttsStop();
    setIsSpeaking(false);
    speakingRef.current = false;
  }, []);

  return { speak, stop, isSpeaking };
}
