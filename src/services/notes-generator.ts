import { sendSimpleMessage } from "./ai-response";
import { getSessionHistory } from "./session-logger";
import { RECAP_PROMPT } from "@/lib/constants";

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
