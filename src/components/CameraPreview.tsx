import { Video, VideoOff } from "lucide-react";

interface CameraPreviewProps {
  setVideoRef: (el: HTMLVideoElement | null) => void;
  isActive: boolean;
  onToggle: () => void;
  className?: string;
}

export function CameraPreview({ setVideoRef, isActive, onToggle, className = "" }: CameraPreviewProps) {
  return (
    <div className={`relative rounded-lg overflow-hidden bg-zinc-900 ${className}`}>
      {isActive ? (
        <>
          <video
            ref={setVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-white font-medium">LIVE</span>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500 p-4">
          <VideoOff className="w-8 h-8" />
          <span className="text-xs">Camera off</span>
        </div>
      )}
      <button
        onClick={onToggle}
        className="absolute bottom-2 right-2 p-1.5 bg-black/60 backdrop-blur-sm rounded-md hover:bg-black/80 transition-colors"
        title={isActive ? "Stop camera" : "Start camera"}
      >
        {isActive ? (
          <VideoOff className="w-3.5 h-3.5 text-white" />
        ) : (
          <Video className="w-3.5 h-3.5 text-white" />
        )}
      </button>
    </div>
  );
}
