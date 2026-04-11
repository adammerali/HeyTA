// Voice logic has been moved to OverlayBar.tsx (persistent MediaStream + MediaRecorder).
// This file is kept as a no-op export for backwards compatibility.

export type VoiceState = "idle" | "listening" | "transcribing" | "capturing";

export interface UseVoiceReturn {
  voiceState: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  lastTranscription: string;
  recentTranscripts: string[];
  isVadAvailable: boolean;
}
