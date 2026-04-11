import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Promise-based async queue that replaces the polling sleep pattern.
 * Chunks pushed by event listeners are yielded to consumers immediately
 * via a pending promise resolver, eliminating busy-wait latency.
 */
function createAsyncQueue<T>(): {
  push: (item: T) => void;
  complete: () => void;
  error: (err: Error) => void;
  iterate: () => AsyncGenerator<T>;
} {
  const buffer: T[] = [];
  let done = false;
  let rejection: Error | null = null;
  let waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;

  function push(item: T) {
    buffer.push(item);
    waiting?.resolve();
    waiting = null;
  }

  function complete() {
    done = true;
    waiting?.resolve();
    waiting = null;
  }

  function error(err: Error) {
    rejection = err;
    done = true;
    waiting?.reject(err);
    waiting = null;
  }

  async function* iterate(): AsyncGenerator<T> {
    while (true) {
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }

      if (done) break;

      await new Promise<void>((resolve, reject) => {
        if (buffer.length > 0 || done) {
          resolve();
        } else {
          waiting = { resolve, reject };
        }
      });

      if (rejection) throw rejection;
    }
  }

  return { push, complete, error, iterate };
}

/**
 * Stream AI response chunks from GPT-4o via Tauri SSE events.
 * Uses a zero-latency async queue instead of polling — chunks are
 * yielded to the consumer as soon as the Tauri event fires.
 */
export async function* streamAIResponse(params: {
  apiKey: string;
  messages: object[];
  model: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { apiKey, messages, model, signal } = params;

  if (signal?.aborted) return;

  const queue = createAsyncQueue<string>();

  const unlisten = await listen("chat_stream_chunk", (event) => {
    queue.push(event.payload as string);
  });
  const unlistenComplete = await listen("chat_stream_complete", () => {
    queue.complete();
  });

  const invokePromise = invoke("chat_stream_response", {
    apiKey,
    messagesJson: JSON.stringify(messages),
    model,
  }).catch((err) => {
    queue.error(new Error(String(err)));
  });

  const abortHandler = () => queue.complete();
  signal?.addEventListener("abort", abortHandler);

  try {
    for await (const chunk of queue.iterate()) {
      if (signal?.aborted) break;
      yield chunk;
    }

    await invokePromise;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
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
