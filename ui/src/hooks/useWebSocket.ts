import { useCallback, useEffect, useRef } from "react";

export type WsMessage =
  | { type: "status"; value: "listening" | "thinking" | "ready" | "captured" }
  | { type: "open_chat" }
  | { type: "request_screenshot" }
  | { type: "user_message"; content: string; image_b64: string | null; is_followup?: boolean }
  | { type: "assistant_chunk"; content: string }
  | { type: "assistant_done" };

const WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 2000;

/**
 * Connects to the Python speech module's WebSocket server.
 * Calls onMessage for every event received. Auto-reconnects on disconnect.
 * Safe to call from multiple components — each gets its own connection.
 */
export function useWebSocket(
  onMessage: (msg: WsMessage) => void,
  onConnect?: () => void,
  onDisconnect?: () => void,
): { send: (data: object) => void } {
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  onMessageRef.current = onMessage;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  // Stable ref to the active socket's send — updated on connect/disconnect
  const sendRef = useRef<(data: object) => void>(() => {});

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

      ws.onopen = () => {
        sendRef.current = (data) => {
          if (ws && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify(data));
        };
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        sendRef.current = () => {};
        onDisconnectRef.current?.();
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
      sendRef.current = () => {};
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { send: useCallback((data: object) => sendRef.current(data), []) };
}
