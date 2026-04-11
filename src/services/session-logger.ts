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

/**
 * Creates a new session, sets it as current, and returns its id.
 * @param workspaceMode - Captured workspace type for the session
 * @returns New session id
 */
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

/**
 * Id of the session currently receiving interactions, if any.
 * @returns Active session id or null
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Appends one Q/A interaction to the current session (starts a session first if needed).
 * @param data - Question, spoken/written replies, optional workspace and screenshot snapshots
 * @returns The stored interaction record
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

/**
 * Returns interactions for a session in the order they were logged.
 * @param sessionId - Session to query; omit to use the current session
 * @returns Matching interactions, or empty if no session id resolves
 */
export function getSessionHistory(sessionId?: string): Interaction[] {
  const sid = sessionId || currentSessionId;
  if (!sid) return [];
  return interactions.filter((i) => i.sessionId === sid);
}

/**
 * Snapshot of all sessions (copy of in-memory list).
 * @returns Array of session metadata objects
 */
export function getAllSessions(): Session[] {
  return [...sessions];
}

/**
 * Sets `endedAt` on the current session and clears the active session pointer.
 * @returns void
 */
export function endSession(): void {
  if (currentSessionId) {
    const session = sessions.find((s) => s.id === currentSessionId);
    if (session) {
      session.endedAt = Date.now();
    }
  }
  currentSessionId = null;
}

/**
 * Resets sessions, interactions, and current session (tests or full app reset).
 * @returns void
 */
export function clearAll(): void {
  sessions = [];
  interactions = [];
  currentSessionId = null;
}
