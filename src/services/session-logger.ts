/**
 * Session Logger — In-Memory Interaction and Session CRUD
 *
 * ## Design Decision: In-Memory vs. SQLite
 *
 * For v1, we use plain arrays instead of SQLite because:
 * 1. Eliminates the tauri-plugin-sql dependency (one less build risk)
 * 2. No async overhead for reads/writes during the latency-sensitive tutoring loop
 * 3. Sufficient for a demo session (~10-50 interactions, ~2-10MB)
 *
 * ## Scalability Ceiling
 *
 * Each interaction stores ~200KB (base64 webcam frame + screenshot + text).
 * At ~50 interactions/session, a 2-hour session uses ~10MB — comfortable.
 * The breaking point is ~500 interactions (~100MB), at which point garbage
 * collection pressure becomes noticeable.
 *
 * ## Migration Path to SQLite (v2)
 *
 * The API surface (startSession, logInteraction, getSessionHistory) is
 * designed to map directly to SQL queries:
 * - `startSession` → INSERT INTO sessions
 * - `logInteraction` → INSERT INTO interactions
 * - `getSessionHistory` → SELECT * FROM interactions WHERE session_id = ?
 * - Images should be written to disk (~/.heyta/sessions/{id}/frames/) with
 *   only file paths stored in the DB, reducing DB size by ~99%.
 */

import type { Interaction, Session } from "@/types";
import { generateId } from "@/lib/utils";

let sessions: Session[] = [];
let interactions: Interaction[] = [];
let currentSessionId: string | null = null;

/** Start a new tutoring session and set it as the current session. */
export function startSession(workspaceMode: "paper" | "whiteboard" = "paper"): string {
  const id = generateId("session");
  const session: Session = {
    id,
    startedAt: Date.now(),
    workspaceMode,
  };
  sessions.push(session);
  currentSessionId = id;
  return id;
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Log a single question/response interaction to the current session.
 * Auto-starts a session if none exists.
 */
export function logInteraction(data: {
  userQuestion: string;
  spokenResponse: string;
  writtenResponse: string;
  workspaceSnapshot?: string;
  screenshot?: string;
}): Interaction {
  if (!currentSessionId) {
    startSession();
  }

  const interaction: Interaction = {
    id: generateId("int"),
    sessionId: currentSessionId!,
    timestamp: Date.now(),
    ...data,
  };

  interactions.push(interaction);
  return interaction;
}

/** Get all interactions for a specific session (or the current session). */
export function getSessionHistory(sessionId?: string): Interaction[] {
  const sid = sessionId || currentSessionId;
  if (!sid) return [];
  return interactions.filter((i) => i.sessionId === sid);
}

export function getAllSessions(): Session[] {
  return [...sessions];
}

/** End the current session by recording its end time. */
export function endSession(): void {
  if (currentSessionId) {
    const session = sessions.find((s) => s.id === currentSessionId);
    if (session) {
      session.endedAt = Date.now();
    }
  }
  currentSessionId = null;
}

/** Clear all in-memory data (for testing or session reset). */
export function clearAll(): void {
  sessions = [];
  interactions = [];
  currentSessionId = null;
}
