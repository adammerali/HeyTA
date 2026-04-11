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
