import type { Interaction, Session } from "@/types";
import { generateId } from "@/lib/utils";

let sessions: Session[] = [];
let interactions: Interaction[] = [];
let currentSessionId: string | null = null;

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

export function getSessionHistory(sessionId?: string): Interaction[] {
  const sid = sessionId || currentSessionId;
  if (!sid) return [];
  return interactions.filter((i) => i.sessionId === sid);
}

export function getAllSessions(): Session[] {
  return [...sessions];
}

export function endSession(): void {
  if (currentSessionId) {
    const session = sessions.find((s) => s.id === currentSessionId);
    if (session) {
      session.endedAt = Date.now();
    }
  }
  currentSessionId = null;
}

export function clearAll(): void {
  sessions = [];
  interactions = [];
  currentSessionId = null;
}
