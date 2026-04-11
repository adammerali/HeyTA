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

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!canvas) {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d")!;
  }
  return { canvas, ctx: ctx! };
}

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
      // Sample every 4th pixel for speed
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

function computeStabilityScore(current: number[][], previous: number[][]): number {
  let stableCells = 0;
  const total = GRID_ROWS * GRID_COLS;
  const THRESHOLD = 15; // pixel intensity diff threshold

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (Math.abs(current[r][c] - previous[r][c]) < THRESHOLD) {
        stableCells++;
      }
    }
  }

  return stableCells / total;
}

export function captureFrame(videoElement: HTMLVideoElement): string | null {
  if (!videoElement.videoWidth || !videoElement.videoHeight) return null;

  const { canvas: c, ctx: context } = getCanvas();
  // Capture at reduced resolution for efficiency
  const scale = Math.min(1, 1280 / videoElement.videoWidth);
  c.width = Math.round(videoElement.videoWidth * scale);
  c.height = Math.round(videoElement.videoHeight * scale);

  context.drawImage(videoElement, 0, 0, c.width, c.height);

  const imageData = context.getImageData(0, 0, c.width, c.height);
  const currentGrid = computeGrid(imageData);

  let stabilityScore = 0.5; // default for first frame
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

  if (frameBuffer.length > FRAME_BUFFER_SIZE) {
    frameBuffer.shift();
  }

  return base64;
}

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

export function getLatestFrame(): string | null {
  if (frameBuffer.length === 0) return null;
  return frameBuffer[frameBuffer.length - 1].imageData;
}

export function getFrameCount(): number {
  return frameBuffer.length;
}

export function clearFrames(): void {
  frameBuffer = [];
  previousGrid = null;
}
