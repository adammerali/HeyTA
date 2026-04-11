import { useState, useCallback, useRef } from "react";
import { speak as ttsSpeak, stop as ttsStop } from "@/services/tts";

export function useTTS(apiKey: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingRef = useRef(false);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim() || !apiKey) return;

      ttsStop();
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
