/**
 * Application Constants
 *
 * Centralized configuration for wake phrases, stop phrases, Whisper artifact
 * filtering, the Socratic tutoring system prompt, and model selection.
 */

/**
 * Wake phrase variants that trigger Hey TA.
 *
 * ## Why So Many Variants?
 *
 * Whisper normalizes speech differently depending on pronunciation, accent, and
 * background noise. "Hey TA" can be transcribed as:
 * - "hey ta" (correct)
 * - "hey t.a." (Whisper interprets it as an abbreviation)
 * - "hey tea" (phonetic similarity)
 * - "hey tee ay" (letter-by-letter pronunciation)
 * - "hay ta" (accent variation)
 * - "eight a" / "hate a" (Whisper misheard)
 *
 * We cast a wide net because false positives are low-cost (the student just
 * gets asked a question they didn't intend) while false negatives break the
 * core experience (student says "Hey TA" and nothing happens).
 */
export const WAKE_PHRASES = [
  "hey ta",
  "hey t.a.",
  "hey t.a",
  "hey tea",
  "hey t a",
  "hey tee a",
  "hey tee ay",
  "hey tee ayy",
  "hey tay",
  "hay ta",
  "hey da",
  "a ta",
  "eight a",
  "hate a",
];

/**
 * Stop phrases that end the multi-utterance capture mode.
 *
 * When the student says "Hey TA" without a trailing question, we enter
 * capture mode and accumulate speech until a stop phrase is detected.
 * These phrases signal the student is done talking.
 */
export const STOP_PHRASES = ["thank you", "stop", "got it", "thanks", "that's it", "done"];

/**
 * Whisper transcription artifacts to filter out.
 *
 * Whisper sometimes "hallucinates" short phrases from silence or background noise.
 * These are common artifacts that should not trigger wake phrase detection or
 * be accumulated as part of a question.
 */
export const WHISPER_ARTIFACTS = new Set([
  ".", "..", "...", "you", "bye", "bye bye", "the end",
  "thank you for watching", "thanks for watching",
  "thank you.", "thanks.", "bye.", "you.", "the end.",
]);

/**
 * Socratic Tutoring System Prompt
 *
 * ## Design Philosophy
 *
 * This prompt enforces "Socratic, not solutionist" behavior:
 * - The spoken_blurb gives ONE key insight or nudge (not the answer)
 * - The written_explanation guides step-by-step but asks the student
 *   to make the final connection
 * - Both outputs reference the student's actual visible work
 *
 * ## Structured Output
 *
 * We require raw JSON output (no markdown fences) with exactly two fields.
 * This enables the dual-delivery UX: spoken_blurb → TTS immediately,
 * written_explanation → side panel rendering.
 *
 * The parser (parseTutoringResponse) has 5 fallback strategies for when the
 * model deviates from this format, but the explicit instruction keeps
 * adherence above 95% in practice.
 */
export const TUTORING_POLICY = `You are "TA", a real-time AI teaching assistant. A student is working on problems at a physical desk (paper, whiteboard, or textbook) and you can see their workspace through a camera.

You MUST respond with ONLY a raw JSON object (no markdown fences, no extra text before or after). The JSON has exactly two string fields:

{"spoken_blurb":"...","written_explanation":"..."}

Rules for "spoken_blurb":
- 1-3 sentences, conversational and encouraging
- Give ONE key insight or nudge toward the next step
- Do NOT mention JSON, formatting, or field names
- This will be read aloud by text-to-speech, so write naturally as speech

Rules for "written_explanation":
- Detailed Markdown explanation with LaTeX math ($...$ inline, $$...$$ display)
- Reference what you can actually see in the student's work
- Include: what they did correctly, where they went wrong, the correct approach step by step
- Socratic: guide toward the answer, don't give it away unless explicitly asked

General rules:
- Reference the student's actual visible work specifically
- If the image is unclear, say so and ask them to reposition
- If a screenshot of a problem is provided, ground your response in that specific problem
- If you have insufficient context, ask a clarifying question`;

/**
 * Recap Generation System Prompt
 *
 * Used by notes-generator.ts to produce post-session study notes.
 * The output format (Summary, Key Concepts, Mistakes, Recommendations)
 * is designed to be directly useful for exam preparation.
 */
export const RECAP_PROMPT = `You are generating study recap notes from a math tutoring session. The student worked on problems on paper/whiteboard and asked their AI teaching assistant for help.

Given the session timeline below, produce:
1. **Session Summary** — 2-3 sentence overview
2. **Key Concepts** — Bullet list of mathematical concepts encountered
3. **Mistakes & Corrections** — For each mistake: what went wrong, the correct approach, the underlying misconception
4. **Study Recommendations** — What to review next

Format in Markdown with LaTeX math notation ($...$ inline, $$...$$ display).`;

export const DEFAULT_MODEL = "gpt-4o";
export const STT_MODEL = "whisper-1";
export const TTS_MODEL = "tts-1";
export const TTS_VOICE = "shimmer";
