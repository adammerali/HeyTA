/**
 * Shared TypeScript interfaces for the Hey TA application.
 *
 * These types define the data contracts between services, hooks, components,
 * and the context layer. They're intentionally kept in a single file because
 * the domain model is small and cohesive — splitting into per-module types
 * would fragment imports without meaningful separation.
 */

/** GPT-4o response format — enforced by the Socratic tutoring system prompt. */
export interface TutoringResponse {
  /** Short (1-3 sentence) spoken hint, delivered via TTS for immediate feedback. */
  spoken_blurb: string;
  /** Detailed Markdown+LaTeX explanation, rendered in the side panel. */
  written_explanation: string;
}

/** A single question/response interaction within a tutoring session. */
export interface Interaction {
  id: string;
  sessionId: string;
  timestamp: number;
  userQuestion: string;
  spokenResponse: string;
  writtenResponse: string;
  /** Base64 JPEG of the best webcam frame at the time of the question. */
  workspaceSnapshot?: string;
  /** Base64 PNG of the user-selected screen region (problem image). */
  screenshot?: string;
}

/** A tutoring session that groups related interactions. */
export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  workspaceMode: "paper" | "whiteboard";
  title?: string;
}

/** Camera and compositor state for the workspace observation system. */
export interface WorkspaceState {
  compositeImage: string | null;
  latestSnapshot: string | null;
  isActive: boolean;
  frameCount: number;
}

/**
 * Application status state machine.
 *
 * The overlay bar displays a colored dot and status text based on this:
 * - idle: gray dot, "Ready"
 * - camera_active: green dot, "Camera on — ready"
 * - listening: blue dot, pulsing, 'Say "Hey TA"'
 * - transcribing: purple dot, "Processing speech..."
 * - thinking: yellow dot, "Thinking..."
 * - speaking: purple dot, "Speaking..."
 * - error: red dot, error message
 */
export type AppStatus =
  | "idle"
  | "camera_active"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

/** A single entry in the rolling conversation history used for follow-up context. */
export interface ConversationEntry {
  role: "user" | "assistant";
  question: string;
  spokenBlurb: string;
  writtenExplanation: string;
  timestamp: number;
}
