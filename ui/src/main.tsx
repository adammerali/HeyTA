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

// Transparency: 10% → opacity 0.9, blur 12px (Pluely defaults)
root.style.setProperty("--opacity", "0.9");
root.style.setProperty("--backdrop-blur", "blur(12px)");

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
