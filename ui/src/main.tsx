import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import OverlayBar from "./pages/OverlayBar";
import "./index.css";

const label = getCurrentWindow().label;

// Always dark mode — copied from Pluely's ThemeProvider
const root = window.document.documentElement;
root.classList.add("dark");

// Overlay: more transparent with stronger blur for frosted-glass look
root.style.setProperty("--opacity", "0.65");
root.style.setProperty("--backdrop-blur", "blur(20px)");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {label === "overlay" ? (
      <OverlayBar />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </React.StrictMode>,
);
