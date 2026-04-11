/**
 * Application Entry Point — Window-Based Routing
 *
 * ## Multi-Window Architecture
 *
 * Tauri creates multiple webview windows that all load the same HTML entry point.
 * We determine which React tree to render based on the window label:
 *
 * - `capture-overlay-{N}` → Overlay component (transparent selection UI)
 * - `overlay` → OverlayBar (floating control bar with AppContext)
 * - `dashboard` (or any other) → App with HashRouter (SidePanel tabs)
 *
 * ## Design Decision: Window Label Routing vs. URL Routing
 *
 * We can't use URL paths for routing because all Tauri windows load the same
 * `index.html`. The dashboard uses `/#/dashboard` in its URL, but the overlay
 * and capture windows load plain `index.html`. The window label (set in
 * tauri.conf.json and WebviewWindowBuilder) is the reliable discriminator.
 *
 * ## Context Scope
 *
 * Capture overlay windows DON'T get AppContext because they're ephemeral
 * (created per-monitor, destroyed after selection) and only need Tauri invoke.
 * The overlay bar and dashboard both wrap in AppProvider for shared state.
 *
 * ## Dark Mode
 *
 * The `dark` class is added to `<html>` unconditionally because Hey TA is
 * dark-mode-only by design. A dark UI minimizes distraction and visual
 * competition with the student's primary workspace.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import OverlayBar from "./pages/OverlayBar";
import Overlay from "./components/Overlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppProvider } from "./contexts/AppContext";
import "./index.css";

const windowLabel = getCurrentWindow().label;

const root = document.documentElement;
root.classList.add("dark");

/** Extract the monitor index from a capture overlay window label. */
function getMonitorIndex(): number {
  const match = windowLabel.match(/capture-overlay-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {windowLabel.startsWith("capture-overlay-") ? (
        <Overlay monitorIndex={getMonitorIndex()} />
      ) : windowLabel === "overlay" ? (
        <AppProvider>
          <OverlayBar />
        </AppProvider>
      ) : (
        <AppProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AppProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
