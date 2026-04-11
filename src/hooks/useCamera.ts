/**
 * useCamera Hook — Webcam Lifecycle and Frame Capture Integration
 *
 * ## Architecture
 *
 * This hook manages two separate video elements:
 * 1. **Offscreen video** (`captureVideoRef`): Hidden element used by the compositor
 *    to capture frames every 2 seconds. Never rendered to the DOM.
 * 2. **Display video** (`videoRef`/`setVideoRef`): Optional visible element for the
 *    camera preview popover. Shares the same MediaStream but is independent.
 *
 * ## Design Decision: Why Two Video Elements?
 *
 * The compositor needs continuous frame access regardless of whether the camera
 * preview popover is visible. If we used a single visible <video>, frame capture
 * would stop whenever the popover was closed. The offscreen element ensures
 * continuous capture even when the preview is hidden.
 *
 * ## Frame Capture Interval (2 seconds)
 *
 * Frames are captured every 2 seconds into the workspace compositor's rolling
 * buffer. This rate balances:
 * - Fast enough to catch a stable frame between writing bursts (~3-5 second gaps)
 * - Slow enough to avoid CPU overhead from canvas operations
 * - Buffer of 10 frames × 2 seconds = 20-second window for stability selection
 *
 * ## Cleanup
 *
 * The hook cleans up all resources on unmount: stops MediaStream tracks (releases
 * the camera), clears the capture interval, and resets the compositor buffer.
 */

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

  /**
   * Start the webcam and begin periodic frame capture.
   *
   * Camera constraints: 1280×720 ideal (720p gives readable handwriting),
   * "environment" facing mode (prefers rear camera on devices with two cameras,
   * though on desktops this is ignored and the default webcam is used).
   */
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

      // Create hidden offscreen video for compositor frame capture
      const offscreen = document.createElement("video");
      offscreen.srcObject = mediaStream;
      offscreen.muted = true;
      offscreen.playsInline = true;
      offscreen.autoplay = true;
      await offscreen.play();
      captureVideoRef.current = offscreen;

      setIsActive(true);

      // Start periodic frame capture — readyState >= 2 ensures video has data
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

  /** Stop the webcam, release all resources, and clear the frame buffer. */
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

  // Sync the display video element with the stream when either changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  /**
   * Ref callback for the visible camera preview <video> element.
   * This pattern allows the preview to mount/unmount freely while the
   * stream continues — the video element connects when it exists.
   */
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

  /** Capture a frame immediately (bypassing the 2-second interval). */
  const captureNow = useCallback((): string | null => {
    if (captureVideoRef.current && captureVideoRef.current.readyState >= 2) {
      return captureFrame(captureVideoRef.current);
    }
    return null;
  }, []);

  // Cleanup on unmount — release camera and clear compositor state
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
