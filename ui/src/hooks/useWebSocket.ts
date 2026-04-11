import { useEffect, useRef } from "react";

export type WsMessage =
  | { type: "status"; value: "listening" | "thinking" | "ready" }
  | { type: "open_chat" }
  | { type: "user_message"; content: string; image_b64: string | null }
  | { type: "assistant_chunk"; content: string }
  | { type: "assistant_done" };

const WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 2000;

/**
 * Connects to the Python speech module's WebSocket server.
 * Calls onMessage for every event received. Auto-reconnects on disconnect.
 * Safe to call from multiple components — each gets its own connection.
 */
export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which handles reconnect
      };
    }

    function scheduleReconnect() {
      if (unmounted) return;
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
