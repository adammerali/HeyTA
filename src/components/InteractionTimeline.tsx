import type { Interaction } from "@/types";
import { Markdown } from "./Markdown";
import { ChevronDown, ChevronRight, Volume2 } from "lucide-react";
import { useState } from "react";

interface InteractionTimelineProps {
  interactions: Interaction[];
  onReplay?: (text: string) => void;
}

function TimelineEntry({
  interaction,
  onReplay,
}: {
  interaction: Interaction;
  onReplay?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const timeStr = new Date(interaction.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="border-l-2 border-emerald-500/30 pl-4 pb-6 relative">
      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-emerald-500" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-zinc-500">{timeStr}</span>
        {onReplay && interaction.spokenResponse && (
          <button
            onClick={() => onReplay(interaction.spokenResponse)}
            className="p-0.5 hover:bg-white/10 rounded"
            title="Replay spoken hint"
          >
            <Volume2 className="w-3 h-3 text-zinc-500" />
          </button>
        )}
      </div>

      <p className="text-sm text-zinc-300 font-medium mb-2">
        "{interaction.userQuestion}"
      </p>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-1"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? "Hide response" : "Show response"}
      </button>

      {expanded && (
        <div className="mt-2 bg-zinc-800/50 rounded-lg p-3">
          <Markdown>{interaction.writtenResponse}</Markdown>
        </div>
      )}

      {interaction.workspaceSnapshot && (
        <div className="mt-2">
          <img
            src={`data:image/jpeg;base64,${interaction.workspaceSnapshot}`}
            alt="Workspace snapshot"
            className="w-24 h-16 object-cover rounded border border-white/10 cursor-pointer hover:opacity-80"
          />
        </div>
      )}
    </div>
  );
}

export function InteractionTimeline({ interactions, onReplay }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
        <p className="text-sm">No interactions yet</p>
        <p className="text-xs mt-1">Ask "Hey TA" for help to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 pl-2">
      {interactions.map((interaction) => (
        <TimelineEntry key={interaction.id} interaction={interaction} onReplay={onReplay} />
      ))}
    </div>
  );
}
