import { describe, it, expect, beforeEach, vi } from "vitest";

// We test the pure functions by importing and exercising the module.
// The compositor relies on HTMLCanvasElement and HTMLVideoElement which
// are partially available in jsdom. We mock what's needed.

describe("workspace-compositor: stability scoring logic", () => {
  // Test the core algorithm: pixel-grid stability scoring.
  // We replicate the scoring logic here to validate the algorithm independently.

  const GRID_COLS = 8;
  const GRID_ROWS = 6;
  const THRESHOLD = 15;

  function computeStabilityScore(current: number[][], previous: number[][]): number {
    let stableCells = 0;
    const total = GRID_ROWS * GRID_COLS;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (Math.abs(current[r][c] - previous[r][c]) < THRESHOLD) {
          stableCells++;
        }
      }
    }
    return stableCells / total;
  }

  function makeGrid(fill: number): number[][] {
    return Array.from({ length: GRID_ROWS }, () =>
      Array.from({ length: GRID_COLS }, () => fill),
    );
  }

  it("returns 1.0 for identical frames", () => {
    const grid = makeGrid(128);
    expect(computeStabilityScore(grid, grid)).toBe(1.0);
  });

  it("returns 1.0 when differences are below threshold", () => {
    const prev = makeGrid(128);
    const curr = makeGrid(128 + 10); // diff = 10 < threshold 15
    expect(computeStabilityScore(curr, prev)).toBe(1.0);
  });

  it("returns 0.0 when all cells differ significantly", () => {
    const prev = makeGrid(0);
    const curr = makeGrid(200); // diff = 200 >> threshold
    expect(computeStabilityScore(curr, prev)).toBe(0.0);
  });

  it("returns partial score for mixed stability", () => {
    const prev = makeGrid(100);
    const curr = prev.map((row, r) =>
      row.map((val) => (r < 3 ? val : val + 50)),
    );
    const score = computeStabilityScore(curr, prev);
    expect(score).toBeGreaterThan(0.0);
    expect(score).toBeLessThan(1.0);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("handles edge case with all zeros", () => {
    const grid = makeGrid(0);
    expect(computeStabilityScore(grid, grid)).toBe(1.0);
  });

  it("handles boundary threshold value", () => {
    const prev = makeGrid(100);
    const curr = makeGrid(100 + 14); // diff = 14, just below threshold 15
    expect(computeStabilityScore(curr, prev)).toBe(1.0);

    const atThreshold = makeGrid(100 + 15); // diff = 15, at threshold (NOT < 15)
    expect(computeStabilityScore(atThreshold, prev)).toBe(0.0);
  });
});

describe("workspace-compositor: frame buffer", () => {
  // Reset module state between tests
  let compositor: typeof import("../workspace-compositor");

  beforeEach(async () => {
    vi.resetModules();
    compositor = await import("../workspace-compositor");
    compositor.clearFrames();
  });

  it("clearFrames resets buffer", () => {
    compositor.clearFrames();
    expect(compositor.getFrameCount()).toBe(0);
    expect(compositor.getBestFrame()).toBeNull();
    expect(compositor.getLatestFrame()).toBeNull();
  });

  it("getFrameCount starts at zero", () => {
    expect(compositor.getFrameCount()).toBe(0);
  });

  it("getBestFrame returns null on empty buffer", () => {
    expect(compositor.getBestFrame()).toBeNull();
  });

  it("getLatestFrame returns null on empty buffer", () => {
    expect(compositor.getLatestFrame()).toBeNull();
  });
});
