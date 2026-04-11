import { invoke } from "@tauri-apps/api/core";

/**
 * Transcribes recorded audio through Tauri (`transcribe_audio` / Whisper); chunks base64 encoding to avoid stack limits.
 * @param audio - Audio blob from MediaRecorder
 * @param apiKey - OpenAI API key (`sk-…`)
 * @returns Trimmed transcript text
 */
export async function fetchSTT(audio: Blob, apiKey: string): Promise<string> {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw new Error("Invalid API key format — must start with 'sk-'");
  }

  const arrayBuffer = await audio.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary);

  const response = await invoke<{
    success: boolean;
    transcription?: string;
    error?: string;
  }>("transcribe_audio", {
    audioBase64: base64,
    apiKey,
    mimeType: audio.type || "audio/mp4",
  });

  if (response.success && response.transcription) {
    return response.transcription.trim();
  }

  const errorMsg = response.error || "Transcription failed";
  if (errorMsg.includes("Unauthorized")) {
    throw new Error("Invalid API key — check your OpenAI key in settings");
  }
  if (errorMsg.includes("Rate limited")) {
    throw new Error("Rate limited — too many requests, please wait a moment");
  }
  if (errorMsg.includes("500") || errorMsg.includes("502") || errorMsg.includes("503")) {
    throw new Error("OpenAI service error — try again in a few seconds");
  }
  throw new Error(errorMsg);
}

/**
 * Picks the first `MediaRecorder`-supported mime type for this environment (e.g. `audio/mp4` on WKWebView).
 * @returns Supported mime type string, or `""` if none
 */
export function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}
