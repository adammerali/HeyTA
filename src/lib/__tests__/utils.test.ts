import { describe, it, expect } from "vitest";
import { detectWakePhrase, containsStopPhrase, parseTutoringResponse, generateId, cn } from "../utils";

describe("detectWakePhrase", () => {
  const phrases = ["hey ta", "hey t.a.", "hey tee ay"];

  it("detects wake phrase and extracts trailing question", () => {
    const result = detectWakePhrase("Hey TA what is the derivative of x squared", phrases);
    expect(result.detected).toBe(true);
    expect(result.question).toBe("what is the derivative of x squared");
  });

  it("detects wake phrase with no trailing question", () => {
    const result = detectWakePhrase("Hey TA", phrases);
    expect(result.detected).toBe(true);
    expect(result.question).toBe("");
  });

  it("is case insensitive", () => {
    const result = detectWakePhrase("HEY TA help me", phrases);
    expect(result.detected).toBe(true);
    expect(result.question).toBe("help me");
  });

  it("returns not detected when no wake phrase present", () => {
    const result = detectWakePhrase("I need help with calculus", phrases);
    expect(result.detected).toBe(false);
    expect(result.question).toBe("");
  });

  it("handles wake phrase in middle of text", () => {
    const result = detectWakePhrase("um so hey ta can you help", phrases);
    expect(result.detected).toBe(true);
    expect(result.question).toBe("can you help");
  });

  it("handles alternate wake phrase variants", () => {
    const result = detectWakePhrase("hey tee ay what is this", phrases);
    expect(result.detected).toBe(true);
    expect(result.question).toBe("what is this");
  });

  it("returns not detected for empty input", () => {
    const result = detectWakePhrase("", phrases);
    expect(result.detected).toBe(false);
  });
});

describe("containsStopPhrase", () => {
  const stopPhrases = ["thank you", "stop", "got it", "thanks"];

  it("detects stop phrase", () => {
    expect(containsStopPhrase("okay thank you", stopPhrases)).toBe(true);
  });

  it("detects stop phrase case-insensitively", () => {
    expect(containsStopPhrase("STOP", stopPhrases)).toBe(true);
  });

  it("returns false when no stop phrase present", () => {
    expect(containsStopPhrase("tell me more about integrals", stopPhrases)).toBe(false);
  });

  it("detects multiple stop phrases", () => {
    expect(containsStopPhrase("got it thanks", stopPhrases)).toBe(true);
  });

  it("handles empty input", () => {
    expect(containsStopPhrase("", stopPhrases)).toBe(false);
  });
});

describe("parseTutoringResponse", () => {
  it("parses raw JSON response", () => {
    const input = JSON.stringify({
      spoken_blurb: "Great question!",
      written_explanation: "Here is the **explanation** with $x^2$.",
    });
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBe("Great question!");
    expect(result.written_explanation).toContain("explanation");
  });

  it("parses JSON inside markdown fences", () => {
    const input = '```json\n{"spoken_blurb":"Nice work!","written_explanation":"The integral is $\\\\int x dx$."}\n```';
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBe("Nice work!");
    expect(result.written_explanation).toContain("integral");
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is my response: {"spoken_blurb":"Check your sign","written_explanation":"You flipped the sign"} done.';
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBe("Check your sign");
    expect(result.written_explanation).toBe("You flipped the sign");
  });

  it("falls back to regex extraction for malformed JSON", () => {
    const input = '{"spoken_blurb":"Almost there","written_explanation":"Keep going",}';
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBe("Almost there");
    expect(result.written_explanation).toBe("Keep going");
  });

  it("falls back to plain text for unparseable input", () => {
    const input = "This is just plain text with no JSON at all. It has two sentences.";
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBeTruthy();
    expect(result.written_explanation).toBe(input);
  });

  it("handles alternate key names", () => {
    const input = JSON.stringify({
      spokenBlurb: "Hint here",
      writtenExplanation: "Full explanation here",
    });
    const result = parseTutoringResponse(input);
    expect(result.spoken_blurb).toBe("Hint here");
    expect(result.written_explanation).toBe("Full explanation here");
  });

  it("handles empty input gracefully", () => {
    const result = parseTutoringResponse("");
    expect(result.spoken_blurb).toBeDefined();
    expect(result.written_explanation).toBeDefined();
  });

  it("unescapes newlines in JSON string values", () => {
    const input = '{"spoken_blurb":"Line one","written_explanation":"Step 1\\nStep 2\\nStep 3"}';
    const result = parseTutoringResponse(input);
    expect(result.written_explanation).toContain("\n");
  });
});

describe("generateId", () => {
  it("generates unique IDs", () => {
    const id1 = generateId("test");
    const id2 = generateId("test");
    expect(id1).not.toBe(id2);
  });

  it("includes prefix when provided", () => {
    const id = generateId("session");
    expect(id.startsWith("session_")).toBe(true);
  });

  it("works without prefix", () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
    expect(id).not.toContain("undefined");
  });
});

describe("cn", () => {
  it("merges tailwind classes", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "extra");
    expect(result).toContain("base");
    expect(result).toContain("extra");
    expect(result).not.toContain("hidden");
  });
});
