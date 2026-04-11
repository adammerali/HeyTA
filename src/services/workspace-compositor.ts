/**
 * Workspace Compositor — Pixel-Grid Stability Scoring for Best-Frame Selection
 *
 * ## Problem
 *
 * When a student is writing on paper, the webcam frequently captures their hand
 * mid-write, pen tips, or motion blur. Sending these frames to GPT-4o produces
 * poor results because the model can't read partially-occluded handwriting.
 *
 * ## Solution: Stability Scoring
 *
 * Instead of sending the latest frame, we maintain a rolling buffer of 10 frames
 * and score each by comparing it to the previous frame using a pixel-grid approach:
 *
 * 1. Divide the frame into an 8×6 grid (48 cells)
 * 2. Compute the average luminance of each cell
 * 3. Compare against the previous frame's grid
 * 4. Count cells where the luminance delta is below a threshold (15)
 * 5. Score = stable_cells / total_cells (0.0 to 1.0)
 *
 * A static frame (student not writing) scores ~1.0. Active writing scores ~0.3-0.5.
 * A hand sweeping across scores ~0.0. We pick the highest-scoring frame from
 * the buffer — typically a clear view of the completed work.
 *
 * ## Design Choices
 *
 * - **8×6 grid** (not pixel-level): 48 comparisons per frame vs. ~900K for 1280×720.
 *   The grid resolution is coarse enough that a student's hand covering 25% of the
 *   frame only drops stability to ~0.75, while active full-frame writing drops to ~0.0.
 *
 * - **Every 4th pixel sampling**: Within each grid cell, we sample every 4th pixel
 *   for speed. For a 1280×720 frame, this reduces per-cell computation from ~14K
 *   pixels to ~900 pixels — a 16x speedup with negligible accuracy loss.
 *
 * - **Threshold of 15**: Chosen empirically. Below 15, minor lighting fluctuations
 *   cause false instability. Above 15, subtle hand movements are missed.
 *
 * - **Buffer size 10**: At 2-second capture intervals, this gives a 20-second window.
 *   Long enough to capture a stable frame between writing bursts, short enough that
 *   the frame is recent and relevant.
 *
 * - **JPEG at 0.85 quality**: Balances image quality (GPT-4o needs readable text)
 *   against base64 size (~120KB per frame). Lower quality degrades handwriting
 *   readability; higher quality bloats the API request.
 */

interface Frame {
  imageData: string; // base64 JPEG
  timestamp: number;
  stabilityScore: number;
}

const FRAME_BUFFER_SIZE = 10;
const GRID_COLS = 8;
const GRID_ROWS = 6;

let frameBuffer: Frame[] = [];
let previousGrid: number[][] | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/** Lazily create a single offscreen canvas for frame processing. */
function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!canvas) {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d")!;
  }
  return { canvas, ctx: ctx! };
}

/**
 * Compute the average luminance for each cell in the grid.
 *
 * Converts RGB to grayscale via simple averaging (R+G+B)/3 rather than
 * perceptual weighting because we only need relative stability detection,
 * not accurate brightness measurement.
 */
function computeGrid(imageData: ImageData): number[][] {
  const { width, height, data } = imageData;
  const cellW = Math.floor(width / GRID_COLS);
  const cellH = Math.floor(height / GRID_ROWS);
  const grid: number[][] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      let sum = 0;
      let count = 0;
      const startX = col * cellW;
      const startY = row * cellH;
      for (let y = startY; y < startY + cellH; y += 4) {
        for (let x = startX; x < startX + cellW; x += 4) {
          const idx = (y * width + x) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          sum += gray;
          count++;
        }
      }
      rowData.push(count > 0 ? sum / count : 0);
    }
    grid.push(rowData);
  }

  return grid;
}

/**
 * Score frame stability by comparing current grid to previous grid.
 *
 * Returns a value from 0.0 (completely different) to 1.0 (identical).
 * The threshold of 15 means a cell must change by more than 15 luminance
 * units (out of 255) to be considered "unstable".
 */
function computeStabilityScore(current: number[][], previous: number[][]): number {
  let stableCells = 0;
  const total = GRID_ROWS * GRID_COLS;
  const THRESHOLD = 15;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (Math.abs(current[r][c] - previous[r][c]) < THRESHOLD) {
        stableCells++;
      }
    }
  }

  return stableCells / total;
}

/**
 * Capture a frame from the video element, compute its stability score,
 * and add it to the rolling buffer.
 *
 * The frame is captured at reduced resolution (max 1280px wide) to keep
 * the base64 output manageable while preserving enough detail for GPT-4o
 * to read handwritten math.
 */
export function captureFrame(videoElement: HTMLVideoElement): string | null {
  if (!videoElement.videoWidth || !videoElement.videoHeight) return null;

  const { canvas: c, ctx: context } = getCanvas();
  const scale = Math.min(1, 1280 / videoElement.videoWidth);
  c.width = Math.round(videoElement.videoWidth * scale);
  c.height = Math.round(videoElement.videoHeight * scale);

  context.drawImage(videoElement, 0, 0, c.width, c.height);

  const imageData = context.getImageData(0, 0, c.width, c.height);
  const currentGrid = computeGrid(imageData);

  // First frame gets a default score of 0.5 (no previous to compare against)
  let stabilityScore = 0.5;
  if (previousGrid) {
    stabilityScore = computeStabilityScore(currentGrid, previousGrid);
  }
  previousGrid = currentGrid;

  const base64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];

  frameBuffer.push({
    imageData: base64,
    timestamp: Date.now(),
    stabilityScore,
  });

  // Evict oldest frame when buffer exceeds capacity
  if (frameBuffer.length > FRAME_BUFFER_SIZE) {
    frameBuffer.shift();
  }

  return base64;
}

/** Select the highest-stability frame from the buffer. */
export function getBestFrame(): string | null {
  if (frameBuffer.length === 0) return null;

  let best = frameBuffer[0];
  for (const frame of frameBuffer) {
    if (frame.stabilityScore > best.stabilityScore) {
      best = frame;
    }
  }
  return best.imageData;
}

/** Get the most recent frame (regardless of stability). */
export function getLatestFrame(): string | null {
  if (frameBuffer.length === 0) return null;
  return frameBuffer[frameBuffer.length - 1].imageData;
}

export function getFrameCount(): number {
  return frameBuffer.length;
}

/** Reset the buffer and previous grid state. */
export function clearFrames(): void {
  frameBuffer = [];
  previousGrid = null;
}
