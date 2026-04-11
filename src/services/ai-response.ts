import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const CHUNK_POLL_MS = 50;

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

  const unlisten = await listen("chat_stream_chunk", (event) => {
    chunks.push(event.payload as string);
  });
  const unlistenComplete = await listen("chat_stream_complete", () => {
    complete = true;
  });

  try {
    if (signal?.aborted) return;

    await invoke("chat_stream_response", {
      apiKey,
      messagesJson: JSON.stringify(messages),
      model,
    });

    let lastIndex = 0;
    while (!complete) {
      if (signal?.aborted) return;
      await new Promise((r) => setTimeout(r, CHUNK_POLL_MS));
      if (signal?.aborted) return;

      for (let i = lastIndex; i < chunks.length; i++) {
        yield chunks[i];
      }
      lastIndex = chunks.length;
    }

    if (signal?.aborted) return;

    for (let i = lastIndex; i < chunks.length; i++) {
      yield chunks[i];
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
