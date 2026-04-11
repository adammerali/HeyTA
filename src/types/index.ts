export interface TutoringResponse {
  spoken_blurb: string;
  written_explanation: string;
}

export interface Interaction {
  id: string;
  sessionId: string;
  timestamp: number;
  userQuestion: string;
  spokenResponse: string;
  writtenResponse: string;
  workspaceSnapshot?: string;
  screenshot?: string;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  workspaceMode: "paper" | "whiteboard";
  title?: string;
}

export interface WorkspaceState {
  compositeImage: string | null;
  latestSnapshot: string | null;
  isActive: boolean;
  frameCount: number;
}

export type AppStatus =
  | "idle"
  | "camera_active"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export interface ConversationEntry {
  role: "user" | "assistant";
  question: string;
  spokenBlurb: string;
  writtenExplanation: string;
  timestamp: number;
}
