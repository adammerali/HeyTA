/**
 * Utility functions — shared across the application.
 *
 * Contains the Tailwind class merger, ID generator, wake/stop phrase detection,
 * and the critical response parser with its 5-strategy fallback chain.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes with conflict resolution (e.g., px-2 + px-4 → px-4). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique ID with an optional prefix.
 * Uses base36-encoded timestamp + random suffix for uniqueness without UUID overhead.
 */
export function generateId(prefix: string = ""): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
}

/**
 * Detect the wake phrase ("Hey TA") in a transcript and extract the trailing question.
 *
 * ## Design Decision: Post-STT Detection vs. Local Wake Word Model
 *
 * We transcribe ALL speech via Whisper and then check for "hey ta" in the text,
 * rather than running a local wake word model (like Porcupine or Snowboy). This
 * is simpler and more reliable for v1:
 *
 * 1. No additional native dependency or model file to bundle
 * 2. Whisper normalizes pronunciation variations ("hey tee ay", "hey da") into
 *    text that our variant list catches
 * 3. The question immediately follows the wake phrase in the same transcript,
 *    so we don't need a separate "listening for question" phase
 *
 * The trade-off is that Whisper transcription costs ~$0.006/minute of audio,
 * even for non-wake-phrase speech. For a study session, this is ~$0.10/hour.
 *
 * @returns `{ detected: true, question: "trailing text" }` or `{ detected: false }`
 */
export function detectWakePhrase(
  text: string,
  wakePhrases: string[],
): { detected: boolean; question: string } {
  const lower = text.toLowerCase();
  for (const phrase of wakePhrases) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      return { detected: true, question: text.slice(idx + phrase.length).trim() };
    }
  }
  return { detected: false, question: "" };
}

/** Check if the transcript contains a stop phrase (e.g., "thank you", "stop"). */
export function containsStopPhrase(text: string, stopPhrases: string[]): boolean {
  const lower = text.toLowerCase();
  return stopPhrases.some((p) => lower.includes(p));
}

/**
 * Parse the model's response into spoken_blurb and written_explanation.
 *
 * ## The 5-Strategy Fallback Chain
 *
 * GPT-4o is instructed to return raw JSON, but models occasionally deviate.
 * This parser handles every observed failure mode:
 *
 * 1. **Markdown fence extraction**: Model wraps JSON in ```json ... ```
 * 2. **Direct JSON parse**: Model returns clean JSON as instructed
 * 3. **Brace extraction**: Model adds prose before/after the JSON object
 * 4. **Regex field extraction**: JSON is malformed (trailing commas, etc.)
 *    but field values are still quoted strings we can extract
 * 5. **Plain text fallback**: Model ignores JSON instruction entirely;
 *    we use the first 2 sentences as the spoken blurb and full text
 *    as the written explanation
 *
 * This chain makes the system resilient to prompt adherence failures
 * that would otherwise crash the tutoring flow.
 */
export function parseTutoringResponse(fullText: string): {
  spoken_blurb: string;
  written_explanation: string;
} {
  const text = fullText.trim();

  // Strategy 1: Extract JSON from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const result = tryParseJSON(fenceMatch[1].trim());
    if (result) return result;
  }

  // Strategy 2: Parse the entire text as JSON
  const result = tryParseJSON(text);
  if (result) return result;

  // Strategy 3: Find the outermost { } and parse that substring
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substr = text.slice(firstBrace, lastBrace + 1);
    const result2 = tryParseJSON(substr);
    if (result2) return result2;
  }

  // Strategy 4: Regex extraction of quoted field values (handles malformed JSON)
  const spokenMatch = text.match(/"spoken_blurb"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const writtenMatch = text.match(/"written_explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (spokenMatch && writtenMatch) {
    return {
      spoken_blurb: unescapeJSON(spokenMatch[1]),
      written_explanation: unescapeJSON(writtenMatch[1]),
    };
  }

  // Strategy 5: Plain text fallback — first 2 sentences as spoken hint
  console.warn("[HeyTA] Could not parse JSON response, using plain text fallback");
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return {
    spoken_blurb: sentences.slice(0, 2).join(" ").trim(),
    written_explanation: text,
  };
}

/**
 * Try to parse a string as JSON and extract the tutoring response fields.
 * Accepts multiple key naming conventions (snake_case, camelCase, abbreviated).
 */
function tryParseJSON(str: string): { spoken_blurb: string; written_explanation: string } | null {
  try {
    const parsed = JSON.parse(str);
    const spoken = parsed.spoken_blurb || parsed.spokenBlurb || parsed.spoken || "";
    const written = parsed.written_explanation || parsed.writtenExplanation || parsed.written || parsed.explanation || "";
    if (spoken || written) {
      return { spoken_blurb: spoken, written_explanation: written || spoken };
    }
  } catch {
    // Not valid JSON — caller will try next strategy
  }
  return null;
}

/** Unescape JSON string escape sequences (\n, \t, \", \\). */
function unescapeJSON(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
