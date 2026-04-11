/**
 * Overlay — Screen Capture Region Selection
 *
 * ## Purpose
 *
 * When the student wants to capture a problem from their screen, this
 * component renders a fullscreen transparent overlay on each monitor.
 * The student draws a rectangle to select the region, which is then
 * cropped from the pre-captured screenshot and sent as context.
 *
 * ## Design Decision: Fullscreen Transparent Window
 *
 * We use Tauri windows (one per monitor) rather than browser-based
 * selection because:
 * 1. Can overlay on top of ALL applications (not just the webview)
 * 2. Captures the actual screen content via xcap before showing the overlay
 * 3. Works across multiple monitors with correct DPI scaling
 *
 * ## Coordinate System
 *
 * The user draws in logical (CSS) pixels. Before sending to Rust, we multiply
 * by `devicePixelRatio` to convert to physical pixels, matching the xcap
 * capture which operates in physical pixel space.
 *
 * ## Minimum Selection Size
 *
 * Selections smaller than 10×10 pixels are treated as accidental clicks
 * and trigger cancellation instead of capture.
 *
 * ## Custom Cursor
 *
 * We hide the system cursor and render a custom crosshair via Lucide's
 * MousePointer2 icon for a cleaner, more precise selection experience.
 */
import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MousePointer2 } from "lucide-react";

interface SelectionCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayProps {
  monitorIndex: number;
}

const Overlay: React.FC<OverlayProps> = ({ monitorIndex }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startCoords, setStartCoords] = useState({ x: 0, y: 0 });
  const [selectionStyle, setSelectionStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    display: "none" as "none" | "block",
  });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const selectionRef = useRef<HTMLDivElement>(null);

  const handleCancel = async () => {
    setIsSelecting(false);
    try {
      await invoke("close_overlay_window");
    } catch {}
  };

  const handleSelectionComplete = async (x: number, y: number, width: number, height: number) => {
    try {
      const sf = window.devicePixelRatio || 1;
      const coords: SelectionCoords = {
        x: Math.round(x * sf),
        y: Math.round(y * sf),
        width: Math.round(width * sf),
        height: Math.round(height * sf),
      };
      await invoke("capture_selected_area", { coords, monitorIndex });
    } catch {
      console.error("Error capturing selected area");
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSelecting(true);
    setStartCoords({ x: e.clientX, y: e.clientY });
    setCursorPosition({ x: e.clientX, y: e.clientY });
    setSelectionStyle({ left: e.clientX, top: e.clientY, width: 0, height: 0, display: "block" });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setCursorPosition({ x: e.clientX, y: e.clientY });
    if (!cursorVisible) setCursorVisible(true);
    if (!isSelecting) return;

    setSelectionStyle((prev) => ({
      ...prev,
      width: Math.abs(e.clientX - startCoords.x),
      height: Math.abs(e.clientY - startCoords.y),
      left: Math.min(e.clientX, startCoords.x),
      top: Math.min(e.clientY, startCoords.y),
    }));
    e.preventDefault();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setCursorPosition({ x: e.clientX, y: e.clientY });
    if (!isSelecting) return;
    setIsSelecting(false);

    const x = Math.min(e.clientX, startCoords.x);
    const y = Math.min(e.clientY, startCoords.y);
    const width = Math.abs(e.clientX - startCoords.x);
    const height = Math.abs(e.clientY - startCoords.y);
    e.preventDefault();

    if (width >= 10 && height >= 10) {
      handleSelectionComplete(x, y, width, height);
    } else {
      handleCancel();
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden"
      style={{ cursor: "none", backgroundColor: "rgba(15, 23, 42, 0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-lg text-sm pointer-events-none z-[5000] shadow-2xl backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Screen Capture:</span>
          <span>Click and drag to select area · Press ESC to cancel</span>
        </div>
      </div>

      <button
        onClick={handleCancel}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleCancel(); }}
        style={{ cursor: "none" }}
        className="fixed top-5 right-5 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm z-[5000] font-semibold"
      >
        Cancel (ESC)
      </button>

      <div
        ref={selectionRef}
        className="absolute border-2 border-white/80 bg-white/10 rounded-lg pointer-events-none"
        style={{
          left: selectionStyle.left,
          top: selectionStyle.top,
          width: selectionStyle.width,
          height: selectionStyle.height,
          display: selectionStyle.display,
          zIndex: 4000,
        }}
      />

      <div
        className="fixed pointer-events-none z-[9999] transition-opacity duration-100"
        style={{
          left: cursorPosition.x,
          top: cursorPosition.y,
          transform: "translate(-2px, -2px)",
          opacity: cursorVisible ? 1 : 0,
        }}
      >
        <MousePointer2 className="w-5 h-5 drop-shadow-2xl fill-white/50 stroke-white" />
      </div>
    </div>
  );
};

export default Overlay;
