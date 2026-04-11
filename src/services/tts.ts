import { invoke } from "@tauri-apps/api/core";

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let isPlaying = false;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 });
  }
  return audioContext;
}

export async function speak(text: string, apiKey: string): Promise<void> {
  stop();

  if (!text.trim()) return;

  const base64Audio = await invoke<string>("fetch_tts_audio", {
    text,
    apiKey,
    voice: "shimmer",
  });

  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

  currentSource = ctx.createBufferSource();
  currentSource.buffer = audioBuffer;
  currentSource.connect(ctx.destination);

  isPlaying = true;
  currentSource.onended = () => {
    isPlaying = false;
    currentSource = null;
  };

  currentSource.start();
}

export function stop(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // Already stopped
    }
    currentSource = null;
  }
  isPlaying = false;
}

export function getIsSpeaking(): boolean {
  return isPlaying;
}
