import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AppStatus, TutoringResponse, Interaction } from "@/types";
import { useCamera } from "@/hooks/useCamera";
import { useTTS } from "@/hooks/useTTS";
import { useCompletion } from "@/hooks/useCompletion";

interface AppContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  status: AppStatus;
  currentResponse: TutoringResponse | null;
  interactions: Interaction[];
  camera: ReturnType<typeof useCamera>;
  tts: ReturnType<typeof useTTS>;
  problemScreenshot: string | null;
  setProblemScreenshot: (s: string | null) => void;
  askQuestion: (question: string) => Promise<void>;
  isStreaming: boolean;
  streamedResponse: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem("heyta_api_key") || "");
  const [problemScreenshot, setProblemScreenshot] = useState<string | null>(null);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem("heyta_api_key", key);
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "heyta_api_key" && e.newValue !== null) {
        setApiKeyState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    const interval = setInterval(() => {
      const stored = localStorage.getItem("heyta_api_key") || "";
      setApiKeyState((prev) => (stored !== prev ? stored : prev));
    }, 2000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  const camera = useCamera();
  const tts = useTTS(apiKey);

  const { state, askQuestion, interactions } = useCompletion({
    apiKey,
    tts,
    problemScreenshot,
  });

  return (
    <AppContext.Provider
      value={{
        apiKey,
        setApiKey,
        status: state.status as AppStatus,
        currentResponse: state.currentResponse,
        interactions,
        camera,
        tts,
        problemScreenshot,
        setProblemScreenshot,
        askQuestion,
        isStreaming: state.isStreaming,
        streamedResponse: state.streamedResponse,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
