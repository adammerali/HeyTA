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

/** Max characters of user-authored text sent in a single prompt turn (after trim). */
const USER_TEXT_MAX_CHARS = 2000;

/**
 * Trims, caps length, and strips common prompt-injection phrases from user text
 * before it is embedded in model messages.
 */
export function sanitizeUserTextForPrompt(text: string): string {
  let s = text.trim();
  if (s.length > USER_TEXT_MAX_CHARS) {
    s = s.slice(0, USER_TEXT_MAX_CHARS);
  }
  const patterns: RegExp[] = [
    /\bignore\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?|rules?|context)\b/gi,
    /\bdisregard\s+(the\s+)?(above|prior|previous)\b/gi,
    /\bforget\s+(everything|all)\s+(above|before|prior)\b/gi,
    /\boverride\s+(the\s+)?(system|instructions?|rules?|prompt)\b/gi,
    /\byou\s+are\s+now\s+(in\s+)?(developer|debug|admin|jailbreak)\s+mode\b/gi,
    /\bnew\s+instructions?\s*:/gi,
    /\bprompt\s+injection\b/gi,
    /\bjailbreak\b/gi,
    /\bDAN\s+mode\b/gi,
  ];
  for (const re of patterns) {
    s = s.replace(re, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

export interface TutoringRequest {
  userQuestion: string;
  workspaceImage: string | null;
  problemImage?: string | null;
  recentTranscripts: string[];
  conversationHistory: ConversationEntry[];
  responseMode?: "hint_first" | "full_explanation";
}

/**
 * Builds OpenAI-style chat messages: system tutoring policy, recent history, then multimodal user turn (images + text).
 * @param request - User question, optional frames, ambient transcripts, history, and response mode
 * @returns Array of role/content objects ready for the chat API
 */
export function buildMessages(request: TutoringRequest): object[] {
  const messages: object[] = [];

  messages.push({ role: "system", content: TUTORING_POLICY });

  const safeQuestion = sanitizeUserTextForPrompt(request.userQuestion);

  // Include last 3 exchanges for continuity (follow-up questions need context)
  const recentHistory = request.conversationHistory.slice(-3);
  for (const entry of recentHistory) {
    messages.push({ role: "user", content: sanitizeUserTextForPrompt(entry.question) });
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
    text: `Student just said: "${safeQuestion}"${modeHint}\n\nDecide: is this directed at you or just thinking aloud? Respond with raw JSON only. If not a question for you, return {"spoken_blurb":"","written_explanation":""}`,
  });

  messages.push({ role: "user", content: userContent });

  return messages;
}

/**
 * Returns the app default LLM id from constants (used when no override is passed).
 * @returns Default model string
 */
export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}
