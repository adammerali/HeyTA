import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "heyta_api_key";
const SYNC_INTERVAL_MS = 2000;

/**
 * Manages API key state with cross-window synchronization.
 *
 * Persists the key in localStorage and syncs across windows via both
 * the `storage` event (cross-window) and a polling fallback (same-window).
 * Also validates key format before accepting it.
 */
export function useApiKeySync() {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(STORAGE_KEY) || "");

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const isValidFormat = useCallback((key: string): boolean => {
    return key.startsWith("sk-") && key.length >= 20;
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setApiKeyState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);

    const interval = setInterval(() => {
      const stored = localStorage.getItem(STORAGE_KEY) || "";
      setApiKeyState((prev) => (stored !== prev ? stored : prev));
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  return { apiKey, setApiKey, clearApiKey, isValidFormat };
}
