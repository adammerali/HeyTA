/**
 * Text-to-Speech Service — OpenAI TTS via Web Audio API
 *
 * ## Audio Pipeline
 *
 * ```
 * Text → Rust fetch_tts_audio → base64 MP3 → atob → Uint8Array
 *   → AudioContext.decodeAudioData → AudioBufferSourceNode → speakers
 * ```
 *
 * ## Design Decision: Web Audio API vs. HTML5 Audio Element
 *
 * We use Web Audio API instead of `<audio src="...">` because:
 * 1. Direct control over playback start/stop (no buffering delays)
 * 2. Can decode from ArrayBuffer (no need for a blob URL or data URI)
 * 3. Future-proof for audio visualization (analyzer node) if needed
 *
 * ## Design Decision: Why Not Browser-Side TTS Fetch?
 *
 * TTS goes through Rust for the same CORS-bypass reason as all other OpenAI calls.
 * The base64 round-trip adds ~33% overhead, but for a 5-second audio clip (~50KB MP3)
 * the overhead is only ~17KB — negligible compared to network latency.
 *
 * ## Sample Rate
 *
 * The AudioContext is created with a 24000Hz sample rate, matching OpenAI TTS output.
 * This avoids unnecessary resampling that could introduce artifacts.
 */

import { invoke } from "@tauri-apps/api/core";

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let isPlaying = false;

/** Lazily initialize AudioContext (must happen after user gesture on some browsers). */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 });
  }
  return audioContext;
}

/**
 * Speak text aloud via OpenAI TTS.
 *
 * Stops any currently playing audio before starting new speech.
 * The function resolves when playback completes (not when the audio is fetched).
 */
export async function speak(text: string, apiKey: string): Promise<void> {
  stop();

  if (!text.trim()) return;

  const base64Audio = await invoke<string>("fetch_tts_audio", {
    text,
    apiKey,
    voice: "shimmer",
  });

  // Decode base64 → binary → ArrayBuffer for Web Audio API
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  // .slice(0) creates a copy because decodeAudioData detaches the original buffer
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

/** Immediately stop any playing audio. */
export function stop(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // Already stopped — AudioBufferSourceNode can only be stopped once
    }
    currentSource = null;
  }
  isPlaying = false;
}

export function getIsSpeaking(): boolean {
  return isPlaying;
}
