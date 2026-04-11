/**
 * AudioVisualizer — Real-Time Microphone Frequency Bars
 *
 * Renders a canvas-based audio visualization showing 16 frequency bars
 * that respond to the microphone input in real time. Displayed in the
 * mic hover popover to give visual confirmation that audio is being captured.
 *
 * ## Technical Approach
 *
 * Uses Web Audio API's AnalyserNode with FFT size 64 (32 frequency bins).
 * We sample 16 evenly-spaced bins and map their 0-255 byte values to
 * bar heights with a gradient fill. The animation runs at requestAnimationFrame
 * rate (~60fps) for smooth visual feedback.
 *
 * ## Lifecycle
 *
 * The AudioContext and AnalyserNode are created when the stream becomes active
 * and destroyed on cleanup. The canvas clears itself when the stream stops.
 */
import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  className?: string;
}

export function AudioVisualizer({ stream, isActive, className = "" }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    const audioCtx = new AudioContext();
    contextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 16;
      const barWidth = (canvas.width / barCount) * 0.6;
      const gap = (canvas.width / barCount) * 0.4;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barHeight = Math.max(2, val * canvas.height * 0.85);
        const x = i * (barWidth + gap) + gap / 2;
        const y = (canvas.height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, "rgba(96, 165, 250, 0.9)");
        gradient.addColorStop(1, "rgba(96, 165, 250, 0.4)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      audioCtx.close();
    };
  }, [stream, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={40}
      className={className}
    />
  );
}
