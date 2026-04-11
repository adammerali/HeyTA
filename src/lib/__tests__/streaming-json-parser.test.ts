import { describe, it, expect } from "vitest";
import { extractPartialResponse } from "../streaming-json-parser";

describe("extractPartialResponse", () => {
  it("returns nulls before spoken_blurb field has appeared", () => {
    expect(extractPartialResponse("")).toEqual({
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    });
    expect(extractPartialResponse('{"')).toEqual({
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    });
    expect(extractPartialResponse('{"written_explanation":"only this')).toEqual({
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    });
  });

  it("returns spoken_blurb when closed while written_explanation is still streaming", () => {
    const partial =
      '{"spoken_blurb":"Great question!","written_explanation":"The derivative of x squared is';
    expect(extractPartialResponse(partial)).toEqual({
      spoken_blurb: "Great question!",
      written_explanation: null,
      isComplete: false,
    });
  });

  it("marks complete when both string fields are closed", () => {
    const full =
      '{"spoken_blurb":"Hi there","written_explanation":"Here is the full **markdown** answer."}';
    expect(extractPartialResponse(full)).toEqual({
      spoken_blurb: "Hi there",
      written_explanation: "Here is the full **markdown** answer.",
      isComplete: true,
    });
  });

  it("strips leading markdown fences (``` and ```json)", () => {
    const partial =
      '```json\n{"spoken_blurb":"Ready","written_explanation":"Still open';
    expect(extractPartialResponse(partial)).toEqual({
      spoken_blurb: "Ready",
      written_explanation: null,
      isComplete: false,
    });

    const partialPlainFence =
      '```\n{"spoken_blurb":"Done","written_explanation":"WIP';
    expect(extractPartialResponse(partialPlainFence)).toEqual({
      spoken_blurb: "Done",
      written_explanation: null,
      isComplete: false,
    });

    const complete =
      '```json\n{"spoken_blurb":"A","written_explanation":"B"}\n```';
    expect(extractPartialResponse(complete)).toEqual({
      spoken_blurb: "A",
      written_explanation: "B",
      isComplete: true,
    });
  });

  it("handles escaped quotes and backslashes inside values", () => {
    const partial =
      '{"spoken_blurb":"Say \\"hello\\"","written_explanation":"Line one\\nLine';
    expect(extractPartialResponse(partial)).toEqual({
      spoken_blurb: 'Say "hello"',
      written_explanation: null,
      isComplete: false,
    });

    const full =
      '{"spoken_blurb":"a\\\\b","written_explanation":"c\\\\d"}';
    expect(extractPartialResponse(full)).toEqual({
      spoken_blurb: "a\\b",
      written_explanation: "c\\d",
      isComplete: true,
    });
  });

  it("handles empty and malformed input without throwing", () => {
    expect(extractPartialResponse("not json at all")).toEqual({
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    });

    expect(
      extractPartialResponse('{"spoken_blurb":"unclosed')
    ).toEqual({
      spoken_blurb: null,
      written_explanation: null,
      isComplete: false,
    });

    expect(
      extractPartialResponse('{"spoken_blurb":"ok","written_explanation":"bad\\')
    ).toEqual({
      spoken_blurb: "ok",
      written_explanation: null,
      isComplete: false,
    });
  });

  it("treats empty string fields as complete when both quotes close", () => {
    expect(
      extractPartialResponse('{"spoken_blurb":"","written_explanation":"x"}')
    ).toEqual({
      spoken_blurb: "",
      written_explanation: "x",
      isComplete: true,
    });
  });
});
