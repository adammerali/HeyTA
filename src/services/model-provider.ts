/**
 * ModelProvider abstraction — decouples business logic from any specific AI vendor.
 *
 * Implementing this interface for a new provider (e.g., Anthropic, Ollama)
 * requires only a new class — no changes to context-builder, session-logger,
 * or any UI component. Swap providers by changing the factory function.
 */

export interface StreamOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelProvider {
  /** Unique identifier for this provider (e.g., "openai", "anthropic") */
  readonly id: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Stream a chat completion, yielding content tokens as they arrive */
  chat(
    messages: object[],
    model: string,
    options?: StreamOptions,
  ): AsyncGenerator<string>;

  /** Non-streaming chat completion (used for recap generation, etc.) */
  chatSimple(messages: object[], model: string): Promise<string>;

  /** Transcribe audio to text */
  transcribe(audioBase64: string, mimeType: string): Promise<string>;

  /** Synthesize speech from text, returning base64-encoded audio */
  speak(text: string, voice?: string): Promise<string>;
}

// --------------------------------------------------------------------------
// OpenAI implementation
// --------------------------------------------------------------------------

import { streamAIResponse, sendSimpleMessage } from "./ai-response";
import { invoke } from "@tauri-apps/api/core";

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";

  constructor(private apiKey: string) {}

  updateApiKey(key: string) {
    this.apiKey = key;
  }

  async *chat(
    messages: object[],
    model: string,
    options?: StreamOptions,
  ): AsyncGenerator<string> {
    yield* streamAIResponse({
      apiKey: this.apiKey,
      messages,
      model,
      signal: options?.signal,
    });
  }

  async chatSimple(messages: object[], model: string): Promise<string> {
    return sendSimpleMessage({
      apiKey: this.apiKey,
      messages,
      model,
    });
  }

  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const response = await invoke<{
      success: boolean;
      transcription?: string;
      error?: string;
    }>("transcribe_audio", {
      audioBase64,
      apiKey: this.apiKey,
      mimeType,
    });
    if (response.success && response.transcription) {
      return response.transcription.trim();
    }
    throw new Error(response.error || "Transcription failed");
  }

  async speak(text: string, voice: string = "shimmer"): Promise<string> {
    return invoke<string>("fetch_tts_audio", {
      text,
      apiKey: this.apiKey,
      voice,
    });
  }
}

// --------------------------------------------------------------------------
// Factory
// --------------------------------------------------------------------------

let currentProvider: ModelProvider | null = null;

/** Get or create the active ModelProvider instance. */
export function getProvider(apiKey: string): ModelProvider {
  if (!currentProvider || (currentProvider as OpenAIProvider).id === "openai") {
    if (!currentProvider) {
      currentProvider = new OpenAIProvider(apiKey);
    } else {
      (currentProvider as OpenAIProvider).updateApiKey(apiKey);
    }
  }
  return currentProvider;
}
