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
// Ollama implementation
// --------------------------------------------------------------------------

/**
 * Reference {@link ModelProvider} for local Ollama — shows how to extend the app with another vendor without changing consumers.
 * Speech is not supported here; use OpenAI (or another provider) for STT/TTS.
 */
export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly displayName = "Ollama (Local)";

  constructor(
    private readonly baseUrl: string = "http://localhost:11434",
    private readonly model: string = "llama3",
  ) {}

  private resolvedModel(model: string): string {
    return model.trim() ? model : this.model;
  }

  async *chat(
    messages: object[],
    model: string,
    options?: StreamOptions,
  ): AsyncGenerator<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const body: Record<string, unknown> = {
      model: this.resolvedModel(model),
      messages,
      stream: true,
    };
    if (options?.maxTokens != null) {
      body.options = { num_predict: options.maxTokens };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Ollama chat: empty response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    const abortHandler = () => reader.cancel();
    options?.signal?.addEventListener("abort", abortHandler);

    try {
      while (true) {
        if (options?.signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed) as {
              message?: { content?: string };
              done?: boolean;
            };
            const content = json.message?.content;
            if (typeof content === "string" && content.length > 0) {
              yield content;
            }
            if (json.done) return;
          } catch {
            // skip malformed NDJSON lines
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          const json = JSON.parse(tail) as { message?: { content?: string } };
          const content = json.message?.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
        } catch {
          // ignore trailing parse errors
        }
      }
    } finally {
      options?.signal?.removeEventListener("abort", abortHandler);
    }
  }

  async chatSimple(messages: object[], model: string): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.resolvedModel(model),
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { message?: { content?: string } };
    const content = json.message?.content;
    if (typeof content !== "string") {
      throw new Error("Ollama chat: missing message content");
    }
    return content;
  }

  async transcribe(_audioBase64: string, _mimeType: string): Promise<string> {
    throw new Error("Ollama does not support STT - use OpenAI Whisper");
  }

  async speak(_text: string, _voice?: string): Promise<string> {
    throw new Error("Ollama does not support TTS - use OpenAI TTS");
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
