/**
 * Streaming JSON parser that extracts fields incrementally from a
 * partial JSON string being built up token-by-token.
 *
 * This enables "early TTS" — we can start speaking the spoken_blurb
 * as soon as that field is complete, without waiting for the full
 * written_explanation to finish streaming.
 */

export interface PartialTutoringResponse {
  spoken_blurb: string | null; // null = not yet complete
  written_explanation: string | null;
  isComplete: boolean;
}

const KEY_SPOKEN = /"spoken_blurb"\s*:\s*"/;
const KEY_WRITTEN = /"written_explanation"\s*:\s*"/;

/** Strip a leading markdown code fence (``` or ```json) so keys are findable while streaming. */
function stripLeadingMarkdownFence(text: string): string {
  const s = text.trimStart();
  if (!s.startsWith("```")) return s;

  let i = 3;
  if (s.slice(i, i + 4).toLowerCase() === "json") {
    i += 4;
  }
  while (i < s.length && /\s/.test(s[i])) {
    i += 1;
  }
  return s.slice(i);
}

/** Index of the closing double-quote for a JSON string value; respects \\ and \" escapes. */
function findClosingQuoteIndex(s: string, contentStart: number): number | null {
  let i = contentStart;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      if (i + 1 >= s.length) return null;
      i += 2;
      continue;
    }
    if (c === '"') return i;
    i += 1;
  }
  return null;
}

function unescapeJSONString(inner: string): string {
  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractQuotedField(text: string, keyPattern: RegExp): string | null {
  const m = keyPattern.exec(text);
  if (!m) return null;
  const valueStart = m.index + m[0].length;
  const closeIdx = findClosingQuoteIndex(text, valueStart);
  if (closeIdx === null) return null;
  return unescapeJSONString(text.slice(valueStart, closeIdx));
}

/**
 * Attempt to extract spoken_blurb from a partial JSON stream.
 * Returns the value as soon as the field's string value is fully closed
 * (closing quote found after "spoken_blurb":"...").
 */
export function extractPartialResponse(partialText: string): PartialTutoringResponse {
  if (!partialText) {
    return {
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    };
  }

  const stripped = stripLeadingMarkdownFence(partialText);
  const spoken_blurb = extractQuotedField(stripped, KEY_SPOKEN);
  const written_explanation = extractQuotedField(stripped, KEY_WRITTEN);

  return {
    spoken_blurb,
    written_explanation,
    isComplete: spoken_blurb !== null && written_explanation !== null,
  };
}
