import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function* streamAIResponse(params: {
  apiKey: string;
  messages: object[];
  model: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { apiKey, messages, model, signal } = params;

  if (signal?.aborted) return;

  const chunks: string[] = [];
  let complete = false;
  let error: string | null = null;
  let yieldIndex = 0;

  const unlisten = await listen("chat_stream_chunk", (event) => {
    chunks.push(event.payload as string);
  });
  const unlistenComplete = await listen("chat_stream_complete", () => {
    complete = true;
  });

  // Fire invoke WITHOUT awaiting — it runs in background while we yield chunks
  const invokePromise = invoke("chat_stream_response", {
    apiKey,
    messagesJson: JSON.stringify(messages),
    model,
  }).catch((err) => {
    error = String(err);
    complete = true;
  });

  try {
    while (!complete && !signal?.aborted) {
      await new Promise((r) => setTimeout(r, 80));

      while (yieldIndex < chunks.length) {
        yield chunks[yieldIndex];
        yieldIndex++;
      }
    }

    // Drain any remaining chunks
    while (yieldIndex < chunks.length) {
      yield chunks[yieldIndex];
      yieldIndex++;
    }

    // Await the invoke to ensure it completes (and catches errors)
    await invokePromise;

    if (error && !signal?.aborted) {
      throw new Error(error);
    }
  } finally {
    unlisten();
    unlistenComplete();
  }
}

export async function sendSimpleMessage(params: {
  apiKey: string;
  messages: object[];
  model: string;
}): Promise<string> {
  return invoke<string>("send_message_simple", {
    apiKey: params.apiKey,
    messagesJson: JSON.stringify(params.messages),
    model: params.model,
  });
}
