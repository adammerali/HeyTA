import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, MessageSquare } from "lucide-react";

type Status = "ready" | "listening" | "thinking";

export default function OverlayBar() {
  const [status, setStatus] = useState<Status>("ready");

  // Listen for status updates from the speech module via Tauri events
  useEffect(() => {
    // Placeholder: in production the speech module emits tauri events
    // and we'd listen with `listen("ta-status", handler)` here
  }, []);

  async function openChat() {
    try {
      await invoke("open_chat_window");
    } catch (e) {
      console.error(e);
    }
  }

  const statusLabel: Record<Status, string> = {
    ready: "Ready",
    listening: "Listening...",
    thinking: "Thinking...",
  };

  const dotColor: Record<Status, string> = {
    ready: "bg-emerald-400",
    listening: "bg-blue-400",
    thinking: "bg-amber-400",
  };

  const pulse = status !== "ready";

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "transparent" }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-3 px-5 py-2 rounded-full select-none cursor-default"
        style={{
          background: "rgba(23, 23, 23, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          height: "42px",
        }}
      >
        {/* Logo / name */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold text-xs"
            style={{ background: "var(--accent)" }}
          >
            TA
          </div>
          <span className="text-white font-semibold text-sm tracking-wide">
            Hey TA
          </span>
        </div>

        <div
          className="w-px h-5"
          style={{ background: "rgba(255,255,255,0.12)" }}
        />

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2 h-2 rounded-full ${dotColor[status]} ${pulse ? "animate-ping absolute" : ""}`}
            />
            <span className={`w-2 h-2 rounded-full ${dotColor[status]}`} />
          </div>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {statusLabel[status]}
          </span>
        </div>

        <div
          className="w-px h-5"
          style={{ background: "rgba(255,255,255,0.12)" }}
        />

        {/* Mic icon */}
        <button
          onClick={() =>
            setStatus((s) => (s === "listening" ? "ready" : "listening"))
          }
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{
            background:
              status === "listening"
                ? "rgba(59,130,246,0.25)"
                : "transparent",
            color:
              status === "listening"
                ? "rgb(147,197,253)"
                : "var(--text-secondary)",
          }}
          title="Toggle listening"
        >
          <Mic size={13} />
        </button>

        {/* Open chat */}
        <button
          onClick={openChat}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--text-primary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--text-secondary)")
          }
          title="Open chat"
        >
          <MessageSquare size={13} />
        </button>
      </div>
    </div>
  );
}
