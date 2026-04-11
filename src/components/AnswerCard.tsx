import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";

interface AnswerCardProps {
  spokenBlurb: string;
  onExpand: () => void;
  onReplay: () => void;
  visible: boolean;
}

export function AnswerCard({ spokenBlurb, onExpand, onReplay, visible }: AnswerCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setExpanded(false);
    const timer = setTimeout(() => setDismissed(true), 15000);
    return () => clearTimeout(timer);
  }, [spokenBlurb]);

  if (!visible || dismissed || !spokenBlurb) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-1 mx-2 z-50">
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-emerald-400 text-xs font-bold">TA</span>
          </div>
          <p className={`text-sm text-zinc-200 leading-relaxed flex-1 ${expanded ? "" : "line-clamp-2"}`}>
            {spokenBlurb}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onReplay}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Replay spoken hint"
            >
              <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>
          </div>
        </div>
        <button
          onClick={onExpand}
          className="w-full px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors border-t border-white/5 text-center"
        >
          View full explanation in panel
        </button>
      </div>
    </div>
  );
}
