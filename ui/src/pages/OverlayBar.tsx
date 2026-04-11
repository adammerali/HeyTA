import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mic, MicOff, MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

type Status = "ready" | "listening" | "thinking";

const STATUS_LABEL: Record<Status, string> = {
  ready: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
};

const STATUS_DOT: Record<Status, string> = {
  ready: "#34d399",
  listening: "#60a5fa",
  thinking: "#fbbf24",
};

export default function OverlayBar() {
  const [status, setStatus] = useState<Status>("ready");

  const startDrag = useCallback(() => {
    getCurrentWindow().startDragging();
  }, []);

  const openChat = useCallback(async () => {
    try {
      await invoke("open_chat_window");
    } catch {}
  }, []);

  // Drive status and chat window from the Python speech module
  useWebSocket((msg) => {
    if (msg.type === "status") setStatus(msg.value);
    if (msg.type === "open_chat") openChat();
  });

  const dotColor = STATUS_DOT[status];
  const isListening = status === "listening";

  return (
    <div className="w-screen h-screen flex items-start justify-center overflow-hidden">
      {/*
        The whole pill is the drag region — interactive buttons capture their
        own mousedown so they won't accidentally trigger the drag.
      */}
      <div
        className="flex items-center gap-2 px-3 h-9 rounded-full cursor-grab active:cursor-grabbing select-none"
        data-tauri-drag-region
        onMouseDown={startDrag}
        style={{
          background: "rgb(from var(--card) r g b / var(--opacity, 0.7))",
          backdropFilter: "var(--backdrop-blur, blur(16px))",
          WebkitBackdropFilter: "var(--backdrop-blur, blur(16px))",
          border: "1px solid rgb(255 255 255 / 0.08)",
          boxShadow: "0 4px 24px rgb(0 0 0 / 0.4)",
        }}
      >
        {/* TA badge */}
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center text-white font-bold text-[8px] tracking-wide shrink-0 pointer-events-none"
          style={{ background: "#10a37f" }}
        >
          TA
        </div>

        {/* Status dot + label */}
        <div className="flex items-center gap-1.5 pointer-events-none">
          <div className="relative w-1.5 h-1.5 shrink-0">
            {status !== "ready" && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: dotColor }}
              />
            )}
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: dotColor }}
            />
          </div>
          <span className="text-[11px] font-medium text-white/70 whitespace-nowrap">
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-3.5 bg-white/10 shrink-0 pointer-events-none" />

        {/* Mic icon — reflects speech module state */}
        <button
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded-md transition-colors shrink-0",
            isListening
              ? "bg-blue-500/20 text-blue-300"
              : "text-white/50 hover:text-white/80"
          )}
          title={isListening ? "Listening…" : "Waiting for 'Hey TA'"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setStatus((s) => (s === "listening" ? "ready" : "listening"))}
        >
          {isListening ? <MicOff size={13} /> : <Mic size={13} />}
        </button>

        {/* Open chat */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/50 hover:text-white/80 transition-colors shrink-0"
          title="Open Chat"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={openChat}
        >
          <MessageSquareIcon size={13} />
        </button>
      </div>
    </div>
  );
}
