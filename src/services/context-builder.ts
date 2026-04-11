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

export function buildMessages(request: TutoringRequest): object[] {
  const messages: object[] = [];

  messages.push({ role: "system", content: TUTORING_POLICY });

  // Last 3 conversation exchanges for continuity
  const recentHistory = request.conversationHistory.slice(-3);
  for (const entry of recentHistory) {
    messages.push({ role: "user", content: entry.question });
    const assistantJSON = JSON.stringify({
      spoken_blurb: entry.spokenBlurb,
      written_explanation: entry.writtenExplanation,
    });
    messages.push({ role: "assistant", content: assistantJSON });
  }

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
