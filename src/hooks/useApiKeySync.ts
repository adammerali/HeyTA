/**
 * useApiKeySync Hook — Cross-Window API Key Persistence and Synchronization
 *
 * ## Problem
 *
 * Hey TA runs two windows (overlay bar + dashboard) that both need the API key.
 * When the user enters their key in either window, the other must update immediately.
 *
 * ## Solution: localStorage + Dual Sync Mechanism
 *
 * 1. **StorageEvent listener**: Fires when *another* window modifies localStorage.
 *    This handles the overlay→dashboard and dashboard→overlay sync case.
 *
 * 2. **Polling fallback** (every 2 seconds): The StorageEvent does NOT fire when
 *    the *same* window modifies localStorage. Polling catches this edge case
 *    (e.g., programmatic key updates within the same window).
 *
 * ## Design Decision: localStorage vs. Tauri Secure Store
 *
 * For v1, we use localStorage because:
 * - Zero additional dependencies
 * - Works across all Tauri webview windows automatically
 * - The key is already sent to OpenAI via Rust (not browser network), so the
 *   primary security concern (network inspector visibility) is already mitigated
 *
 * For v2, migrating to tauri-plugin-store with OS keychain integration would
 * provide encrypted-at-rest storage. The hook's API would remain identical.
 *
 * ## Key Format Validation
 *
 * `isValidFormat` checks that the key starts with "sk-" and is at least 20
 * characters. This catches common entry errors (pasting partial keys, entering
 * the wrong credential) before the first API call fails with a cryptic 401.
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "heyta_api_key";
const SYNC_INTERVAL_MS = 2000;

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

  /** Validate API key format (not correctness — that requires an API call). */
  const isValidFormat = useCallback((key: string): boolean => {
    return key.startsWith("sk-") && key.length >= 20;
  }, []);

  useEffect(() => {
    // Cross-window sync via StorageEvent
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setApiKeyState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);

    // Same-window polling fallback
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
