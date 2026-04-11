import { invoke } from "@tauri-apps/api/core";

export async function fetchSTT(audio: Blob, apiKey: string): Promise<string> {
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
  throw new Error(response.error || "Transcription failed");
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
