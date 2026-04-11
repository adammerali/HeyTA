import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GripVerticalIcon, Mic, MicOff, MessageSquareIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "ready" | "listening" | "thinking";

const App = () => {
  const [status, setStatus] = useState<Status>("ready");
  const isListening = status === "listening";

  const startDrag = () => {
    getCurrentWindow().startDragging();
  };

  const openDashboard = async () => {
    try {
      await invoke("open_chat_window");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  const dotColor =
    status === "ready" ? "#34d399" : isListening ? "#60a5fa" : "#fbbf24";

  return (
    // Copied from Pluely pages/app/index.tsx
    <div className="w-screen h-screen flex overflow-hidden justify-center items-start">
      <Card className="w-full flex flex-row items-center gap-2 p-2">

        {/* DragButton — copied from Pluely DragButton.tsx */}
        <Button
          variant="ghost"
          size="icon"
          className="-ml-[2px] w-fit cursor-grab active:cursor-grabbing"
          data-tauri-drag-region
          onMouseDown={startDrag}
        >
          <GripVerticalIcon className="h-4 w-4 pointer-events-none" />
        </Button>

        {/* TA badge */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold shrink-0 text-[9px] tracking-wide"
          style={{ background: "#10a37f" }}
        >
          TA
        </div>

        {/* Name */}
        <span className="text-sm font-semibold whitespace-nowrap">Hey TA</span>

        <div className="w-px h-4 bg-border shrink-0" />

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative w-2 h-2 shrink-0">
            {status !== "ready" && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-75"
                style={{ background: dotColor }}
              />
            )}
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: dotColor }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {status === "ready" ? "Ready" : isListening ? "Listening…" : "Thinking…"}
          </span>
        </div>

        <div className="w-px h-4 bg-border shrink-0" />

        {/* Mic toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "cursor-pointer h-8 w-8",
            isListening && "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
          )}
          title={isListening ? "Stop listening" : "Start listening"}
          onClick={() => setStatus((s) => (s === "listening" ? "ready" : "listening"))}
        >
          {isListening ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {/* Open chat — mirrors Pluely's "Open Dev Space" button */}
        <Button
          size="icon"
          className="cursor-pointer h-8 w-8"
          title="Open Chat"
          onClick={openDashboard}
        >
          <MessageSquareIcon className="h-4 w-4" />
        </Button>

      </Card>
    </div>
  );
};

export default App;
