import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Radio, Mic, MessageSquareIcon, Camera, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

type CaptureMode = "voice" | "screenshot" | "camera";

type Status = "offline" | "ready" | "listening" | "captured" | "thinking";

const STATUS_LABEL: Record<Status, string> = {
  offline: "Offline",
  ready: "Ready",
  listening: "Listening…",
  captured: "Got it…",
  thinking: "Thinking…",
};

const STATUS_DOT: Record<Status, string> = {
  offline: "#6b7280",
  ready: "#34d399",
  listening: "#60a5fa",
  captured: "#a78bfa",
  thinking: "#fbbf24",
};

const MODE_CONFIG: { mode: CaptureMode; icon: React.ElementType; label: string }[] = [
  { mode: "voice",      icon: Mic,     label: "Voice only"  },
  { mode: "screenshot", icon: Monitor, label: "Screenshot"  },
  { mode: "camera",     icon: Camera,  label: "Webcam"      },
];

export default function OverlayBar() {
  const [status, setStatus] = useState<Status>("offline");
  const [captureMode, setCaptureMode] = useState<CaptureMode>(
    () => (localStorage.getItem("captureMode") as CaptureMode) ?? "camera",
  );

  // The body has a solid background from global CSS which would show as a
  // rectangle behind the pill. Since this window is transparent, we clear it.
  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  function handleModeChange(mode: CaptureMode) {
    setCaptureMode(mode);
    localStorage.setItem("captureMode", mode);
  }

  const startDrag = useCallback(() => {
    getCurrentWindow().startDragging();
  }, []);

  const openChat = useCallback(async () => {
    try {
      await invoke("open_chat_window");
    } catch {}
  }, []);

  // Drive status and chat window from the Python speech module
  useWebSocket(
    (msg) => {
      if (msg.type === "status") setStatus(msg.value);
      if (msg.type === "open_chat") openChat();
    },
    () => setStatus("ready"),    // WebSocket connected → Python is up, mic is live
    () => setStatus("offline"),  // WebSocket closed → Python stopped or crashed
  );

  const dotColor = STATUS_DOT[status];
  const isListening = status === "listening";
  const isOffline = status === "offline";

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
          style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" }}
        >
          TA
        </div>

        {/* Status dot + label */}
        <div className="flex items-center gap-1.5 pointer-events-none">
          <div className="relative w-1.5 h-1.5 shrink-0">
            {status !== "ready" && status !== "offline" && (
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

        {/* Recording state indicator (read-only) */}
        <div
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded-md shrink-0",
            isOffline   ? "text-white/20" :
            isListening ? "bg-blue-500/20 text-blue-300" :
                          "text-white/40"
          )}
          title={isOffline ? "Speech module offline" : isListening ? "Listening…" : "Waiting for 'Hey TA'"}
        >
          <Radio size={11} />
        </div>

        {/* Divider */}
        <div className="w-px h-3.5 bg-white/10 shrink-0 pointer-events-none" />

        {/* Capture mode selector */}
        <div className="flex items-center gap-0.5 shrink-0">
          {MODE_CONFIG.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              title={label}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => handleModeChange(mode)}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded-md transition-colors",
                captureMode === mode
                  ? "bg-white/15 text-white"
                  : "text-white/35 hover:text-white/70",
              )}
            >
              <Icon size={12} />
            </button>
          ))}
        </div>

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
