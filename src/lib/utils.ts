import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix: string = ""): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
}

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

export function containsStopPhrase(text: string, stopPhrases: string[]): boolean {
  const lower = text.toLowerCase();
  return stopPhrases.some((p) => lower.includes(p));
}

/**
 * Robustly extract spoken_blurb and written_explanation from the model's response.
 * Handles: raw JSON, JSON in markdown fences, partial JSON, and plain text fallback.
 */
export function parseTutoringResponse(fullText: string): {
  spoken_blurb: string;
  written_explanation: string;
} {
  const text = fullText.trim();

  // Strategy 1: Try extracting JSON from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const result = tryParseJSON(fenceMatch[1].trim());
    if (result) return result;
  }

  // Strategy 2: Try parsing the whole text as JSON
  const result = tryParseJSON(text);
  if (result) return result;

  // Strategy 3: Find the first { and last } and try parsing that substring
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substr = text.slice(firstBrace, lastBrace + 1);
    const result2 = tryParseJSON(substr);
    if (result2) return result2;
  }

  // Strategy 4: Regex extraction of field values (handles malformed JSON)
  const spokenMatch = text.match(/"spoken_blurb"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const writtenMatch = text.match(/"written_explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (spokenMatch && writtenMatch) {
    return {
      spoken_blurb: unescapeJSON(spokenMatch[1]),
      written_explanation: unescapeJSON(writtenMatch[1]),
    };
  }

  // Strategy 5: Plain text fallback — use first 2 sentences as spoken
  console.warn("[HeyTA] Could not parse JSON response, using plain text fallback");
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return {
    spoken_blurb: sentences.slice(0, 2).join(" ").trim(),
    written_explanation: text,
  };
}

function tryParseJSON(str: string): { spoken_blurb: string; written_explanation: string } | null {
  try {
    const parsed = JSON.parse(str);
    const spoken = parsed.spoken_blurb || parsed.spokenBlurb || parsed.spoken || "";
    const written = parsed.written_explanation || parsed.writtenExplanation || parsed.written || parsed.explanation || "";
    if (spoken || written) {
      return { spoken_blurb: spoken, written_explanation: written || spoken };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

function unescapeJSON(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
