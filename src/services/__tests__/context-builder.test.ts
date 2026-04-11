import { describe, it, expect } from "vitest";
import { buildMessages, getDefaultModel } from "../context-builder";
import type { ConversationEntry } from "@/types";

describe("buildMessages", () => {
  it("includes system prompt as first message", () => {
    const messages = buildMessages({
      userQuestion: "What is 2+2?",
      workspaceImage: null,
      recentTranscripts: [],
      conversationHistory: [],
    });
    expect(messages[0]).toHaveProperty("role", "system");
    expect((messages[0] as { content: string }).content).toContain("TA");
  });

  it("includes user question in final message", () => {
    const messages = buildMessages({
      userQuestion: "Help with derivatives",
      workspaceImage: null,
      recentTranscripts: [],
      conversationHistory: [],
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const textParts = (last.content as { type: string; text?: string }[]).filter(
      (c) => c.type === "text",
    );
    const combined = textParts.map((p) => p.text).join(" ");
    expect(combined).toContain("Help with derivatives");
  });

  it("includes workspace image when provided", () => {
    const messages = buildMessages({
      userQuestion: "Check my work",
      workspaceImage: "base64imagedata",
      recentTranscripts: [],
      conversationHistory: [],
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const imageParts = (last.content as { type: string }[]).filter(
      (c) => c.type === "image_url",
    );
    expect(imageParts.length).toBe(1);
  });

  it("includes problem screenshot when provided", () => {
    const messages = buildMessages({
      userQuestion: "Solve this",
      workspaceImage: null,
      problemImage: "screenshotdata",
      recentTranscripts: [],
      conversationHistory: [],
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const imageParts = (last.content as { type: string }[]).filter(
      (c) => c.type === "image_url",
    );
    expect(imageParts.length).toBe(1);
  });

  it("includes both images when both provided", () => {
    const messages = buildMessages({
      userQuestion: "Compare these",
      workspaceImage: "webcamdata",
      problemImage: "screenshotdata",
      recentTranscripts: [],
      conversationHistory: [],
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const imageParts = (last.content as { type: string }[]).filter(
      (c) => c.type === "image_url",
    );
    expect(imageParts.length).toBe(2);
  });

  it("limits conversation history to last 3 entries", () => {
    const history: ConversationEntry[] = Array.from({ length: 5 }, (_, i) => ({
      role: "user" as const,
      question: `Question ${i}`,
      spokenBlurb: `Hint ${i}`,
      writtenExplanation: `Explanation ${i}`,
      timestamp: Date.now() + i,
    }));

    const messages = buildMessages({
      userQuestion: "Next question",
      workspaceImage: null,
      recentTranscripts: [],
      conversationHistory: history,
    });

    // System + (3 history pairs x 2) + user = 8
    expect(messages.length).toBe(8);
  });

  it("includes recent transcripts when provided", () => {
    const messages = buildMessages({
      userQuestion: "What about this?",
      workspaceImage: null,
      recentTranscripts: ["thinking out loud", "wait let me reconsider"],
      conversationHistory: [],
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const textParts = (last.content as { type: string; text?: string }[]).filter(
      (c) => c.type === "text",
    );
    const combined = textParts.map((p) => p.text).join(" ");
    expect(combined).toContain("thinking out loud");
  });

  it("adds full explanation mode hint when specified", () => {
    const messages = buildMessages({
      userQuestion: "Explain everything",
      workspaceImage: null,
      recentTranscripts: [],
      conversationHistory: [],
      responseMode: "full_explanation",
    });
    const last = messages[messages.length - 1] as { content: object[] };
    const textParts = (last.content as { type: string; text?: string }[]).filter(
      (c) => c.type === "text",
    );
    const combined = textParts.map((p) => p.text).join(" ");
    expect(combined).toContain("full explanation");
  });
});

describe("getDefaultModel", () => {
  it("returns gpt-4o", () => {
    expect(getDefaultModel()).toBe("gpt-4o");
  });
});
