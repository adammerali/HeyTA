import { invoke } from "@tauri-apps/api/core";

/**
 * Transcribe an audio blob via the Rust backend (OpenAI Whisper).
 *
 * Converts the blob to base64 in chunks to avoid call-stack overflow,
 * then invokes the Rust `transcribe_audio` command. Handles specific
 * HTTP error codes (401, 429, 500+) with user-friendly messages.
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
 * Detect the best MediaRecorder mimeType supported by this browser/webview.
 * WKWebView (macOS Tauri) doesn't support audio/webm — it supports audio/mp4.
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
