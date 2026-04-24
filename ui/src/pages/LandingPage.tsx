import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Monitor, Camera } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

const FEATURES = [
  { icon: Mic,      label: "Voice",      desc: "Ask questions hands-free" },
  { icon: Monitor,  label: "Screenshot", desc: "Capture your screen instantly" },
  { icon: Camera,   label: "Webcam",     desc: "Show your work live" },
];

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  // Trigger fade-up after first paint
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // If Python fires open_chat, navigate straight to chat
  useWebSocket((msg) => {
    if (msg.type === "open_chat") navigate("/chat");
  });

  function handleGetStarted() {
    navigate("/chat");
  }

  async function handleHide() {
    await invoke("minimize_window");
  }

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center select-none"
      style={{ background: "#4C0000" }}
    >
      {/* Fade-up content wrapper */}
      <div
        className="flex flex-col items-center text-center px-8"
        style={{
          transition: "opacity 0.6s ease, transform 0.6s ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
        }}
      >
        {/* Logo */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg"
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.25)",
            backdropFilter: "blur(12px)",
          }}
        >
          TA
        </div>

        {/* Heading */}
        <h1 className="text-5xl font-semibold text-white tracking-tight mb-3">
          HeyTA
        </h1>

        {/* Subtitle */}
        <p className="text-base mb-12" style={{ color: "rgba(255,255,255,0.5)" }}>
          Your AI teaching assistant — always listening, always ready.
        </p>

        {/* Feature pills */}
        <div className="flex items-center gap-4 mb-14">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(8px)",
                width: 130,
              }}
            >
              <Icon size={18} style={{ color: "rgba(255,255,255,0.6)" }} />
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="text-xs leading-tight" style={{ color: "rgba(255,255,255,0.4)" }}>
                {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGetStarted}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-85"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(12px)",
            }}
          >
            Get Started
          </button>
          <button
            onClick={handleHide}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-85"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            Hide to overlay
          </button>
        </div>

        {/* Hint */}
        <p className="mt-8 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          Say <span style={{ color: "rgba(255,255,255,0.4)" }}>"Hey TA"</span> at any time to open chat
        </p>
      </div>
    </div>
  );
}
