import { describe, it, expect, beforeEach } from "vitest";
import {
  startSession,
  getCurrentSessionId,
  logInteraction,
  getSessionHistory,
  getAllSessions,
  endSession,
  clearAll,
} from "../session-logger";

describe("session-logger", () => {
  beforeEach(() => {
    clearAll();
  });

  describe("startSession", () => {
    it("creates a session and sets it as current", () => {
      const id = startSession();
      expect(id).toBeTruthy();
      expect(getCurrentSessionId()).toBe(id);
    });

    it("generates unique session IDs", () => {
      const id1 = startSession();
      clearAll();
      const id2 = startSession();
      expect(id1).not.toBe(id2);
    });

    it("records workspace mode", () => {
      startSession("whiteboard");
      const sessions = getAllSessions();
      expect(sessions[0].workspaceMode).toBe("whiteboard");
    });

    it("defaults to paper mode", () => {
      startSession();
      const sessions = getAllSessions();
      expect(sessions[0].workspaceMode).toBe("paper");
    });
  });

  describe("logInteraction", () => {
    it("logs an interaction to the current session", () => {
      startSession();
      const interaction = logInteraction({
        userQuestion: "What is 2+2?",
        spokenResponse: "Think about basic addition.",
        writtenResponse: "The answer is $2 + 2 = 4$.",
      });
      expect(interaction.id).toBeTruthy();
      expect(interaction.userQuestion).toBe("What is 2+2?");
    });

    it("auto-starts a session if none exists", () => {
      expect(getCurrentSessionId()).toBeNull();
      logInteraction({
        userQuestion: "Help",
        spokenResponse: "Sure",
        writtenResponse: "How can I help?",
      });
      expect(getCurrentSessionId()).toBeTruthy();
    });

    it("includes optional workspace snapshot", () => {
      startSession();
      const interaction = logInteraction({
        userQuestion: "Check my work",
        spokenResponse: "Looking good",
        writtenResponse: "Your approach is correct",
        workspaceSnapshot: "base64imagedata",
      });
      expect(interaction.workspaceSnapshot).toBe("base64imagedata");
    });

    it("includes optional screenshot", () => {
      startSession();
      const interaction = logInteraction({
        userQuestion: "Solve this problem",
        spokenResponse: "Let me see",
        writtenResponse: "This is a quadratic equation",
        screenshot: "screenshotbase64",
      });
      expect(interaction.screenshot).toBe("screenshotbase64");
    });
  });

  describe("getSessionHistory", () => {
    it("returns interactions for the current session", () => {
      startSession();
      logInteraction({ userQuestion: "Q1", spokenResponse: "A1", writtenResponse: "W1" });
      logInteraction({ userQuestion: "Q2", spokenResponse: "A2", writtenResponse: "W2" });
      const history = getSessionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].userQuestion).toBe("Q1");
      expect(history[1].userQuestion).toBe("Q2");
    });

    it("returns empty array when no session exists", () => {
      expect(getSessionHistory()).toEqual([]);
    });

    it("filters by session ID", () => {
      const id1 = startSession();
      logInteraction({ userQuestion: "Q1", spokenResponse: "A1", writtenResponse: "W1" });
      const id2 = startSession();
      logInteraction({ userQuestion: "Q2", spokenResponse: "A2", writtenResponse: "W2" });

      expect(getSessionHistory(id1)).toHaveLength(1);
      expect(getSessionHistory(id2)).toHaveLength(1);
      expect(getSessionHistory(id1)[0].userQuestion).toBe("Q1");
    });
  });

  describe("endSession", () => {
    it("records end time and clears current session", () => {
      startSession();
      endSession();
      expect(getCurrentSessionId()).toBeNull();
      const sessions = getAllSessions();
      expect(sessions[0].endedAt).toBeDefined();
    });

    it("is safe to call with no active session", () => {
      expect(() => endSession()).not.toThrow();
    });
  });

  describe("clearAll", () => {
    it("resets all state", () => {
      startSession();
      logInteraction({ userQuestion: "Q", spokenResponse: "A", writtenResponse: "W" });
      clearAll();
      expect(getCurrentSessionId()).toBeNull();
      expect(getAllSessions()).toEqual([]);
      expect(getSessionHistory()).toEqual([]);
    });
  });
});
