/**
 * Context Builder — Assembles the multimodal message array for GPT-4o.
 *
 * ## Design Decision: Why a Separate Context Builder?
 *
 * The message assembly logic is isolated from the AI response service because:
 * 1. It's pure and testable — no async, no side effects, no Tauri dependency
 * 2. The message format is GPT-4o-specific but the *inputs* are generic
 *    (question, images, history) — a different model might need different formatting
 * 3. The Socratic tutoring policy prompt is a critical design element that
 *    should be visible and editable in one place, not buried in API call logic
 *
 * ## Message Structure
 *
 * ```
 * [
 *   { role: "system", content: TUTORING_POLICY },          // Socratic instruction
 *   { role: "user",   content: "Question 1" },             // History entry 1
 *   { role: "assistant", content: "{spoken_blurb:...}" },
 *   { role: "user",   content: "Question 2" },             // History entry 2
 *   { role: "assistant", content: "{spoken_blurb:...}" },
 *   { role: "user",   content: [                            // Current question
 *     { type: "text", text: "Current workspace:..." },
 *     { type: "image_url", image_url: { url: "data:..." } },  // Webcam frame
 *     { type: "image_url", image_url: { url: "data:..." } },  // Screenshot
 *     { type: "text", text: "Student's question: ..." },
 *   ]}
 * ]
 * ```
 *
 * ## Rolling History Window
 *
 * We keep the last 3 conversation exchanges (6 messages) to provide continuity
 * for follow-up questions. This keeps the prompt under ~8K tokens:
 * - System prompt: ~1K tokens
 * - 3 history exchanges × ~2K each: ~6K tokens
 * - Current question + images: ~1K tokens (text) + image tokens
 *
 * This leaves ~120K tokens for the model's response within GPT-4o's 128K context.
 */

import { TUTORING_POLICY, DEFAULT_MODEL } from "@/lib/constants";
import type { ConversationEntry } from "@/types";

export interface TutoringRequest {
  userQuestion: string;
  workspaceImage: string | null;
  problemImage?: string | null;
  recentTranscripts: string[];
  conversationHistory: ConversationEntry[];
  responseMode?: "hint_first" | "full_explanation";
}

/**
 * Build the messages array for a GPT-4o chat completion request.
 *
 * The system prompt enforces Socratic behavior — the model must return JSON
 * with `spoken_blurb` (1-3 sentences, conversational) and `written_explanation`
 * (detailed Markdown+LaTeX). This dual-output format lets us deliver the spoken
 * hint via TTS immediately while the full explanation renders in the panel.
 */
export function buildMessages(request: TutoringRequest): object[] {
  const messages: object[] = [];

  messages.push({ role: "system", content: TUTORING_POLICY });

  // Include last 3 exchanges for continuity (follow-up questions need context)
  const recentHistory = request.conversationHistory.slice(-3);
  for (const entry of recentHistory) {
    messages.push({ role: "user", content: entry.question });
    const assistantJSON = JSON.stringify({
      spoken_blurb: entry.spokenBlurb,
      written_explanation: entry.writtenExplanation,
    });
    messages.push({ role: "assistant", content: assistantJSON });
  }

  // Build multimodal user message with images and text
  const userContent: object[] = [];

  if (request.workspaceImage) {
    userContent.push({
      type: "text",
      text: "Current workspace (paper/whiteboard captured by camera):",
    });
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${request.workspaceImage}` },
    });
  }

  if (request.problemImage) {
    userContent.push({
      type: "text",
      text: "Source problem / reference material from screen:",
    });
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${request.problemImage}` },
    });
  }

  // Include ambient speech transcripts for additional context
  if (request.recentTranscripts.length > 0) {
    userContent.push({
      type: "text",
      text: `Recent things the student said while working: ${request.recentTranscripts.join(" | ")}`,
    });
  }

  const modeHint =
    request.responseMode === "full_explanation"
      ? " (The student has asked for a full explanation.)"
      : "";

  userContent.push({
    type: "text",
    text: `Student's question: ${request.userQuestion}${modeHint}\n\nRemember: respond with ONLY raw JSON, no markdown fences. {"spoken_blurb":"...","written_explanation":"..."}`,
  });

  messages.push({ role: "user", content: userContent });

  return messages;
}

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}
