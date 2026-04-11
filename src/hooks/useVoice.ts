import { useState, useCallback, useRef } from "react";
import { fetchSTT } from "@/services/stt";
import { floatArrayToWav, detectWakePhrase, containsStopPhrase } from "@/lib/utils";
import { WAKE_PHRASES, STOP_PHRASES, WHISPER_ARTIFACTS } from "@/lib/constants";

export type VoiceState = "idle" | "listening" | "transcribing" | "capturing";

export interface UseVoiceReturn {
  voiceState: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  lastTranscription: string;
  recentTranscripts: string[];
  isVadAvailable: boolean;
}

export function useVoice(params: {
  apiKey: string;
  onWakePhrase: (question: string) => void;
  onTranscription?: (text: string) => void;
}) {
  const { apiKey, onWakePhrase, onTranscription } = params;
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [lastTranscription, setLastTranscription] = useState("");
  const recentTranscriptsRef = useRef<string[]>([]);
  const capturingPartsRef = useRef<string[]>([]);
  const isCapturingRef = useRef(false);

  const handleSpeechEnd = useCallback(
    async (audio: Float32Array) => {
      if (!apiKey) return;

      setVoiceState("transcribing");
      try {
        const wavBlob = floatArrayToWav(audio, 16000);
        const transcription = await fetchSTT(wavBlob, apiKey);

        if (!transcription || WHISPER_ARTIFACTS.has(transcription.trim().toLowerCase())) {
          setVoiceState("listening");
          return;
        }

        setLastTranscription(transcription);
        onTranscription?.(transcription);

        recentTranscriptsRef.current.push(transcription);
        if (recentTranscriptsRef.current.length > 20) {
          recentTranscriptsRef.current.shift();
        }

        if (isCapturingRef.current) {
          // In continuous capture mode (after wake phrase, waiting for stop)
          if (containsStopPhrase(transcription, STOP_PHRASES)) {
            isCapturingRef.current = false;
            const fullQuestion = capturingPartsRef.current.join(" ").trim();
            capturingPartsRef.current = [];
            if (fullQuestion) {
              onWakePhrase(fullQuestion);
            }
            setVoiceState("listening");
          } else {
            capturingPartsRef.current.push(transcription);
            setVoiceState("capturing");
          }
        } else {
          // Check for wake phrase
          const { detected, question } = detectWakePhrase(transcription, WAKE_PHRASES);
          if (detected) {
            if (question) {
              // Wake phrase + question in same utterance
              onWakePhrase(question);
              setVoiceState("listening");
            } else {
              // Start continuous capture mode
              isCapturingRef.current = true;
              capturingPartsRef.current = [];
              setVoiceState("capturing");
            }
          } else {
            setVoiceState("listening");
          }
        }
      } catch (err) {
        console.error("Voice processing error:", err);
        setVoiceState("listening");
      }
    },
    [apiKey, onWakePhrase, onTranscription],
  );

  const startListening = useCallback(() => {
    setVoiceState("listening");
  }, []);

  const stopListening = useCallback(() => {
    setVoiceState("idle");
    isCapturingRef.current = false;
    capturingPartsRef.current = [];
  }, []);

  return {
    voiceState,
    startListening,
    stopListening,
    lastTranscription,
    recentTranscripts: recentTranscriptsRef.current,
    handleSpeechEnd,
    isVadAvailable: true,
  };
}
