/**
 * OverlayBar — The Primary UI Surface (Floating Control Bar)
 *
 * ## Architecture
 *
 * This is the most complex component in the app. It manages:
 * - Voice recording loop (persistent MediaStream + chunked MediaRecorder)
 * - Wake phrase detection pipeline (Whisper STT → phrase matching → question extraction)
 * - Multi-utterance capture mode ("Hey TA" → accumulate → "stop" → submit)
 * - Camera toggle integration with the workspace compositor
 * - Screenshot capture via native macOS screencapture
 * - API key entry popover
 * - Status indicator state machine (idle → listening → transcribing → thinking → speaking)
 * - Hover popovers with camera preview, mic visualizer, and screenshot display
 *
 * ## Design Decision: Recording Loop Architecture
 *
 * We use a continuous recording loop rather than VAD-triggered recording:
 * 1. Start MediaRecorder, record for 4 seconds, stop
 * 2. On stop: immediately start next chunk (no gap), transcribe previous in parallel
 * 3. Check transcript for wake phrase or stop phrase
 *
 * This overlapping approach ensures zero gaps in audio capture. The 4-second chunk
 * size balances latency (shorter = faster response) vs. accuracy (Whisper needs
 * enough context to transcribe accurately).
 *
 * ## Design Decision: Persistent MediaStream
 *
 * We acquire the MediaStream once and reuse it across all recording chunks.
 * Creating a new stream per chunk would cause the macOS mic permission prompt
 * to flash repeatedly and adds ~200ms latency per chunk for stream negotiation.
 *
 * ## Status State Machine
 *
 * The display status combines local state with AppContext status:
 * - If AppContext says "thinking" or "speaking", that overrides local status
 * - Otherwise, local status (idle, listening, camera_active, error) is used
 * This ensures the overlay reflects the global tutoring flow state.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  GripVerticalIcon,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MonitorUp,
  PanelRightOpen,
  Loader2,
  KeyRound,
  X,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, detectWakePhrase, containsStopPhrase } from "@/lib/utils";
import { AnswerCard } from "@/components/AnswerCard";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { useApp } from "@/contexts/AppContext";
import { fetchSTT, getSupportedMimeType } from "@/services/stt";
import { WAKE_PHRASES, STOP_PHRASES, WHISPER_ARTIFACTS } from "@/lib/constants";

type BarStatus = "idle" | "camera_active" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
type HoverTarget = null | "camera" | "mic" | "screenshot" | "apikey";

const OverlayBar = () => {
  const {
    apiKey,
    setApiKey,
    status: appStatus,
    currentResponse,
    camera,
    tts,
    askQuestion,
    problemScreenshot,
    setProblemScreenshot,
  } = useApp();

  const [localStatus, setLocalStatus] = useState<BarStatus>("idle");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [vadEnabled, setVadEnabled] = useState(false);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const capturingRef = useRef(false);
  const capturingPartsRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadEnabledRef = useRef(false);
  const supportedMimeRef = useRef<string>("");
  const persistentStreamRef = useRef<MediaStream | null>(null);
  const recordingLoopRef = useRef(false);

  useEffect(() => { vadEnabledRef.current = vadEnabled; }, [vadEnabled]);

  useEffect(() => {
    supportedMimeRef.current = getSupportedMimeType();
    console.log("[HeyTA] MediaRecorder mimeType:", supportedMimeRef.current || "NONE SUPPORTED");
  }, []);

  const displayStatus: BarStatus =
    appStatus === "thinking" || appStatus === "speaking"
      ? (appStatus as BarStatus)
      : localStatus;

  const handleHoverEnter = (target: HoverTarget) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverTarget(target);
  };

  const handleHoverLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => setHoverTarget(null), 300);
  };

  // ---- Voice / STT ----

  const pendingSTTRef = useRef(0);

  const handleAudioBlob = useCallback(
    async (audioBlob: Blob) => {
      if (!apiKey) return;

      pendingSTTRef.current++;

      try {
        const text = await fetchSTT(audioBlob, apiKey);
        if (!text || WHISPER_ARTIFACTS.has(text.trim().toLowerCase())) {
          return;
        }

        console.log("[HeyTA] Transcript:", text, "| capturing:", capturingRef.current);

        if (capturingRef.current) {
          if (containsStopPhrase(text, STOP_PHRASES)) {
            capturingRef.current = false;
            const fullQ = capturingPartsRef.current.join(" ").trim();
            capturingPartsRef.current = [];
            console.log("[HeyTA] Stop phrase detected, full question:", fullQ);
            if (fullQ) askQuestion(fullQ);
          } else {
            capturingPartsRef.current.push(text);
          }
        } else {
          const { detected, question } = detectWakePhrase(text, WAKE_PHRASES);
          if (detected) {
            console.log("[HeyTA] Wake phrase detected, trailing question:", question);
            if (question) {
              askQuestion(question);
            } else {
              capturingRef.current = true;
              capturingPartsRef.current = [];
            }
          }
        }
      } catch (err) {
        console.error("STT error:", err);
      } finally {
        pendingSTTRef.current--;
      }
    },
    [apiKey, askQuestion],
  );

  // Start a single recording chunk on the persistent stream
  const recordChunk = useCallback(() => {
    const stream = persistentStreamRef.current;
    const mime = supportedMimeRef.current;
    if (!stream || !mime || !vadEnabledRef.current) {
      recordingLoopRef.current = false;
      return;
    }

    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      recordingLoopRef.current = false;
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      mediaRecorderRef.current = null;
      const blob = new Blob(chunks, { type: mime });

      // Start next chunk IMMEDIATELY — don't wait for transcription
      if (vadEnabledRef.current) {
        recordChunk();
      } else {
        recordingLoopRef.current = false;
      }

      // Transcribe in parallel (fire-and-forget)
      if (blob.size > 500) {
        handleAudioBlob(blob);
      }
    };

    recorder.onerror = () => {
      mediaRecorderRef.current = null;
      if (vadEnabledRef.current) setTimeout(recordChunk, 500);
      else recordingLoopRef.current = false;
    };

    mediaRecorderRef.current = recorder;
    recorder.start();

    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 4000);
  }, [handleAudioBlob]);

  // Acquire persistent mic stream and start recording loop
  const startMic = useCallback(async () => {
    const mime = supportedMimeRef.current;
    if (!mime) {
      setStatusError("Browser does not support audio recording");
      setLocalStatus("error");
      setVadEnabled(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      persistentStreamRef.current = stream;
      setMicStream(stream);
      setLocalStatus("listening");
      recordingLoopRef.current = true;
      recordChunk();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      setStatusError(msg);
      setLocalStatus("error");
      setVadEnabled(false);
    }
  }, [recordChunk]);

  const stopMic = useCallback(() => {
    recordingLoopRef.current = false;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (persistentStreamRef.current) {
      persistentStreamRef.current.getTracks().forEach((t) => t.stop());
      persistentStreamRef.current = null;
    }
    setMicStream(null);
    capturingRef.current = false;
    capturingPartsRef.current = [];
  }, []);

  const toggleMic = useCallback(() => {
    if (!apiKey) {
      setHoverTarget("apikey");
      return;
    }
    setStatusError(null);
    if (vadEnabled) {
      setVadEnabled(false);
      stopMic();
      setLocalStatus(camera.isActive ? "camera_active" : "idle");
    } else {
      setVadEnabled(true);
    }
  }, [vadEnabled, camera.isActive, apiKey, stopMic]);

  useEffect(() => {
    if (vadEnabled) startMic();
  }, [vadEnabled]);

  // ---- Camera ----

  const toggleCamera = useCallback(async () => {
    setStatusError(null);
    if (camera.isActive) {
      camera.stop();
      setLocalStatus(vadEnabled ? "listening" : "idle");
    } else {
      const ok = await camera.start();
      if (ok) {
        setLocalStatus(vadEnabled ? "listening" : "camera_active");
      } else {
        setStatusError(camera.error || "Camera failed — check System Settings → Privacy → Camera");
        setLocalStatus("error");
      }
    }
  }, [camera, vadEnabled]);

  // ---- Screenshot ----

  const handleScreenshot = useCallback(async () => {
    setIsScreenshotting(true);
    try {
      const b64 = await invoke<string>("native_screenshot");
      setProblemScreenshot(b64);
    } catch {
      // User cancelled
    }
    setIsScreenshotting(false);
  }, [setProblemScreenshot]);

  const handleSaveApiKey = () => {
    if (apiKeyDraft.trim()) {
      setApiKey(apiKeyDraft.trim());
      setHoverTarget(null);
    }
  };

  const openPanel = () => invoke("toggle_dashboard");

  // ---- Status display ----

  const dotColor = (() => {
    switch (displayStatus) {
      case "idle": return "#6b7280";
      case "camera_active": return "#34d399";
      case "listening": return "#60a5fa";
      case "transcribing": return "#a78bfa";
      case "thinking": return "#fbbf24";
      case "speaking": return "#c084fc";
      case "error": return "#ef4444";
      default: return "#6b7280";
    }
  })();

  const statusText = (() => {
    if (statusError) return statusError;
    switch (displayStatus) {
      case "idle":
        if (!apiKey) return "Click key icon to enter API key";
        return camera.isActive ? "Ready — camera on" : "Ready";
      case "camera_active":
        return "Camera on — ready";
      case "listening":
        return capturingRef.current
          ? 'Listening... say "stop" when done'
          : 'Say "Hey TA" + your question';
      case "transcribing": return "Processing speech...";
      case "thinking": return "Thinking...";
      case "speaking": return "Speaking...";
      case "error": return statusError || "Error";
      default: return "Ready";
    }
  })();

  const isAnimating = !["idle", "camera_active"].includes(displayStatus);

  // ---- Hover popovers ----

  const popoverContent = (() => {
    if (hoverTarget === "apikey") {
      return (
        <div className="w-60">
          <div className="text-[10px] text-amber-400 mb-2 font-medium flex items-center gap-1">
            <KeyRound className="w-3 h-3" /> OPENAI API KEY
          </div>
          {apiKey ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-400">Key is set</span>
              </div>
              <p className="text-[10px] text-zinc-500">sk-...{apiKey.slice(-4)}</p>
              <button
                onClick={() => { setApiKey(""); setApiKeyDraft(""); }}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Clear key
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                placeholder="sk-..."
                className="w-full rounded px-2 py-1.5 text-xs text-white bg-zinc-800 border border-zinc-700 outline-none focus:border-emerald-500/50"
                autoFocus
              />
              <button
                onClick={handleSaveApiKey}
                className="w-full py-1.5 rounded text-[10px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                Save
              </button>
              <p className="text-[10px] text-zinc-500">Required for mic, AI, and TTS.</p>
            </div>
          )}
        </div>
      );
    }

    if (hoverTarget === "camera") {
      if (camera.error) {
        return (
          <div className="w-52">
            <div className="text-[10px] text-red-400 mb-1 font-medium">CAMERA — ERROR</div>
            <p className="text-[10px] text-zinc-400">{camera.error}</p>
            <p className="text-[10px] text-zinc-500 mt-1">Check System Settings → Privacy & Security → Camera.</p>
          </div>
        );
      }
      if (camera.isActive) {
        return (
          <div className="w-52">
            <div className="text-[10px] text-emerald-400 mb-1.5 font-medium">CAMERA — LIVE</div>
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <video ref={camera.setVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] text-white font-medium">LIVE</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5">Click icon to stop. Best frame sent with each question.</p>
          </div>
        );
      }
      return (
        <div className="w-44">
          <div className="text-[10px] text-zinc-400 mb-1 font-medium">CAMERA — OFF</div>
          <p className="text-[10px] text-zinc-500">Click to start webcam so TA can see your workspace.</p>
        </div>
      );
    }

    if (hoverTarget === "mic") {
      if (!apiKey) {
        return (
          <div className="w-44">
            <div className="text-[10px] text-amber-400 mb-1 font-medium flex items-center gap-1">
              <KeyRound className="w-3 h-3" /> NEEDS API KEY
            </div>
            <p className="text-[10px] text-zinc-500">Click the key button to enter your OpenAI key.</p>
          </div>
        );
      }
      if (vadEnabled) {
        return (
          <div className="w-52">
            <div className="text-[10px] text-blue-400 mb-1.5 font-medium">MICROPHONE — ACTIVE</div>
            <div className="bg-zinc-800/80 rounded-lg p-2 flex items-center justify-center">
              <AudioVisualizer stream={micStream} isActive={vadEnabled} />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5">
              {capturingRef.current ? 'Capturing... say "stop" when done' : 'Say "Hey TA" then your question'}
            </p>
          </div>
        );
      }
      return (
        <div className="w-44">
          <div className="text-[10px] text-zinc-400 mb-1 font-medium">MICROPHONE — OFF</div>
          <p className="text-[10px] text-zinc-500">Click to start listening. Say "Hey TA" + question.</p>
        </div>
      );
    }

    if (hoverTarget === "screenshot") {
      if (problemScreenshot) {
        return (
          <div className="w-52">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-amber-400 font-medium">CAPTURED PROBLEM</span>
              <button onClick={() => setProblemScreenshot(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3 h-3" />
              </button>
            </div>
            <img src={`data:image/png;base64,${problemScreenshot}`} className="w-full rounded-lg border border-white/10" />
            <p className="text-[10px] text-zinc-500 mt-1.5">Sent as context with next question.</p>
          </div>
        );
      }
      return (
        <div className="w-44">
          <div className="text-[10px] text-zinc-400 mb-1 font-medium">SCREEN CAPTURE</div>
          <p className="text-[10px] text-zinc-500">Click to select a region of your screen.</p>
        </div>
      );
    }
    return null;
  })();

  const cameraRef = useRef<HTMLButtonElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const screenshotRef = useRef<HTMLButtonElement>(null);
  const apikeyRef = useRef<HTMLButtonElement>(null);
  const [popoverLeft, setPopoverLeft] = useState(0);

  useEffect(() => {
    const ref =
      hoverTarget === "camera" ? cameraRef :
      hoverTarget === "mic" ? micRef :
      hoverTarget === "screenshot" ? screenshotRef :
      hoverTarget === "apikey" ? apikeyRef : null;
    if (ref?.current) {
      const rect = ref.current.getBoundingClientRect();
      setPopoverLeft(rect.left + rect.width / 2);
    }
  }, [hoverTarget]);

  return (
    <div className="w-screen h-screen flex flex-col overflow-visible items-center">
      <Card className="w-full flex flex-row items-center gap-1.5 p-2 relative shrink-0">
        <Button
          variant="ghost" size="icon"
          className="-ml-[2px] w-fit cursor-grab active:cursor-grabbing"
          onMouseDown={() => getCurrentWindow().startDragging()}
        >
          <GripVerticalIcon className="h-4 w-4 pointer-events-none" />
        </Button>

        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold shrink-0 text-[9px] tracking-wide" style={{ background: "#10a37f" }}>TA</div>

        <div className="w-px h-4 bg-border shrink-0" />

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="relative w-2 h-2 shrink-0">
            {isAnimating && <span className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ background: dotColor }} />}
            <span className="absolute inset-0 rounded-full" style={{ background: dotColor }} />
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap truncate">{statusText}</span>
        </div>

        <div className="w-px h-4 bg-border shrink-0" />

        {/* Camera — icon shows CURRENT state */}
        <Button
          ref={cameraRef} variant="ghost" size="icon"
          className={cn("cursor-pointer h-7 w-7 relative", camera.isActive && "bg-emerald-500/20 text-emerald-400")}
          onClick={toggleCamera}
          onMouseEnter={() => handleHoverEnter("camera")}
          onMouseLeave={handleHoverLeave}
        >
          {camera.isActive ? <Camera className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5 opacity-50" />}
          {camera.isActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        </Button>

        {/* Mic — icon shows CURRENT state */}
        <Button
          ref={micRef} variant="ghost" size="icon"
          className={cn(
            "cursor-pointer h-7 w-7 relative",
            vadEnabled && "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
            !apiKey && "opacity-50",
          )}
          onClick={toggleMic}
          onMouseEnter={() => handleHoverEnter("mic")}
          onMouseLeave={handleHoverLeave}
        >
          {displayStatus === "transcribing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : vadEnabled ? (
            <Mic className="h-3.5 w-3.5" />
          ) : (
            <MicOff className="h-3.5 w-3.5 opacity-50" />
          )}
          {vadEnabled && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
        </Button>

        {/* Screenshot */}
        <Button
          ref={screenshotRef} variant="ghost" size="icon"
          className={cn("cursor-pointer h-7 w-7 relative", problemScreenshot && "bg-amber-500/20 text-amber-400")}
          onClick={handleScreenshot}
          onMouseEnter={() => handleHoverEnter("screenshot")}
          onMouseLeave={handleHoverLeave}
          disabled={isScreenshotting}
        >
          {isScreenshotting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MonitorUp className="h-3.5 w-3.5" />}
          {problemScreenshot && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
        </Button>

        <div className="w-px h-4 bg-border shrink-0" />

        <Button
          ref={apikeyRef} variant="ghost" size="icon"
          className={cn("cursor-pointer h-7 w-7 relative", apiKey ? "text-emerald-400" : "text-amber-400")}
          onClick={() => setHoverTarget(hoverTarget === "apikey" ? null : "apikey")}
          onMouseEnter={() => handleHoverEnter("apikey")}
          onMouseLeave={handleHoverLeave}
        >
          <KeyRound className="h-3.5 w-3.5" />
          {apiKey && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        </Button>

        <Button variant="ghost" size="icon" className="cursor-pointer h-7 w-7" onClick={openPanel}>
          <PanelRightOpen className="h-3.5 w-3.5" />
        </Button>

        <AnswerCard
          spokenBlurb={currentResponse?.spoken_blurb || ""}
          visible={!!currentResponse}
          onExpand={openPanel}
          onReplay={() => currentResponse && tts.speak(currentResponse.spoken_blurb)}
        />
      </Card>

      {hoverTarget && popoverContent && (
        <div
          className="absolute z-50 mt-1"
          style={{ top: 44, left: Math.max(8, Math.min(popoverLeft - 120, 680 - 260)) }}
          onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
          onMouseLeave={handleHoverLeave}
        >
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3">
            {popoverContent}
          </div>
        </div>
      )}

      {camera.isActive && hoverTarget !== "camera" && (
        <video ref={camera.setVideoRef} className="hidden" autoPlay playsInline muted />
      )}
    </div>
  );
};

export default OverlayBar;
