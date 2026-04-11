/**
 * Notes Generator — AI-Powered Post-Session Recap
 *
 * ## Purpose
 *
 * After a study session, generates a comprehensive recap that includes:
 * - Session summary (what topics were covered)
 * - Key concepts encountered
 * - Mistakes made and their corrections (with the underlying misconception)
 * - Study recommendations for what to review next
 *
 * ## Design Decision: GPT-4o for Recap (Not Local Processing)
 *
 * We use GPT-4o to generate recaps rather than simple text aggregation because:
 * 1. The model can identify *patterns* across interactions (e.g., repeated sign errors)
 * 2. It can synthesize corrections into study recommendations
 * 3. The output quality with LaTeX math notation matches the session's explanations
 *
 * We use the non-streaming `sendSimpleMessage` because students aren't watching
 * the recap generate — they'll switch to the Notes tab and see the result.
 */

import { sendSimpleMessage } from "./ai-response";
import { getSessionHistory } from "./session-logger";
import { RECAP_PROMPT } from "@/lib/constants";

/**
 * Generate a Markdown study recap from the current session's interactions.
 *
 * Collects all interactions, formats them as a chronological timeline,
 * and sends to GPT-4o with the RECAP_PROMPT system instruction.
 */
export async function generateSessionRecap(
  apiKey: string,
  sessionId?: string,
): Promise<string> {
  const history = getSessionHistory(sessionId);

  if (history.length === 0) {
    return "No interactions recorded in this session.";
  }

  const timeline = history
    .map(
      (h) =>
        `[${new Date(h.timestamp).toLocaleTimeString()}]\nQuestion: ${h.userQuestion}\nResponse: ${h.writtenResponse}`,
    )
    .join("\n---\n");

  const messages = [
    { role: "system", content: RECAP_PROMPT },
    {
      role: "user",
      content: `Here is the session timeline:\n\n${timeline}\n\nGenerate the study recap notes.`,
    },
  ];

  return sendSimpleMessage({
    apiKey,
    messages,
    model: "gpt-4o",
  });
}
