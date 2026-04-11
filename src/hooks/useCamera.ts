import { useState, useRef, useCallback, useEffect } from "react";
import { captureFrame, getBestFrame, getLatestFrame, getFrameCount, clearFrames } from "@/services/workspace-compositor";

const CAPTURE_INTERVAL_MS = 2000;

export function useCamera() {
  const [isActive, setIsActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: false,
      });

      setStream(mediaStream);

      const offscreen = document.createElement("video");
      offscreen.srcObject = mediaStream;
      offscreen.muted = true;
      offscreen.playsInline = true;
      offscreen.autoplay = true;
      await offscreen.play();
      captureVideoRef.current = offscreen;

      setIsActive(true);

      intervalRef.current = setInterval(() => {
        if (captureVideoRef.current && captureVideoRef.current.readyState >= 2) {
          captureFrame(captureVideoRef.current);
        }
      }, CAPTURE_INTERVAL_MS);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      console.error("Camera access failed:", msg);
      setError(msg);
      setIsActive(false);
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.pause();
      captureVideoRef.current.srcObject = null;
      captureVideoRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setIsActive(false);
    setError(null);
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const setVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      if (el && stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    },
    [stream],
  );

  const captureNow = useCallback((): string | null => {
    if (captureVideoRef.current && captureVideoRef.current.readyState >= 2) {
      return captureFrame(captureVideoRef.current);
    }
    return null;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (captureVideoRef.current) {
        captureVideoRef.current.pause();
        captureVideoRef.current.srcObject = null;
      }
      clearFrames();
    };
  }, []);

  return {
    isActive,
    stream,
    error,
    videoRef,
    setVideoRef,
    start,
    stop,
    captureNow,
    getBestFrame,
    getLatestFrame,
    getFrameCount,
  };
}
