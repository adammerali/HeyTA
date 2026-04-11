import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function floatArrayToWav(
  audioData: Float32Array,
  sampleRate: number = 16000,
): Blob {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + audioData.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, audioData.length * 2, true);

  let offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
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

export function parseTutoringResponse(fullText: string): {
  spoken_blurb: string;
  written_explanation: string;
} {
  // Try to extract JSON from response (model might wrap it in markdown code blocks)
  let jsonStr = fullText.trim();

  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      spoken_blurb: parsed.spoken_blurb || parsed.spokenBlurb || "",
      written_explanation:
        parsed.written_explanation || parsed.writtenExplanation || parsed.written || "",
    };
  } catch {
    // Fallback: first 2 sentences as spoken, full text as written
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    return {
      spoken_blurb: sentences.slice(0, 2).join(" ").trim(),
      written_explanation: fullText,
    };
  }
}
