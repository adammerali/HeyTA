# Hey TA — Architecture

## System Overview

Hey TA is a Tauri 2 desktop application with a Rust backend and React 19 frontend. It runs as two windows on macOS: a floating overlay bar (NSPanel) and a dashboard side panel.

```
┌─────────────────────────────────────────────────┐
│                  macOS Desktop                   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │   Overlay Bar (NSPanel, always on top)   │   │
│  │  [TA] Hey TA  ● Listening  📷 🎤 📸 📋  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌────────────────────┐                         │
│  │  Dashboard Panel   │  Student's              │
│  │  ┌──────────────┐  │  other apps             │
│  │  │ Camera PiP   │  │  (textbook,             │
│  │  │ (workspace)  │  │   homework,             │
│  │  └──────────────┘  │   browser)              │
│  │  ┌──────────────┐  │                         │
│  │  │ AI Response  │  │                         │
│  │  │ (Markdown +  │  │                         │
│  │  │  LaTeX)      │  │                         │
│  │  └──────────────┘  │                         │
│  │  [Timeline][Notes] │                         │
│  │  ┌──────────────┐  │                         │
│  │  │ Text input   │  │                         │
│  │  └──────────────┘  │                         │
│  └────────────────────┘                         │
└─────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop shell | Tauri 2 (Rust) | Native performance, small binary, macOS private API access for NSPanel |
| Frontend | React 19 + TypeScript + Vite 7 | Fast iteration, rich ecosystem, type safety |
| Styling | Tailwind CSS 4 | Utility-first, dark mode, consistent design |
| Voice detection | @ricky0123/vad-react + onnxruntime-web | Browser-side VAD, no server needed |
| Speech-to-text | OpenAI Whisper API | Best-in-class accuracy for conversational speech |
| AI model | OpenAI GPT-4o (via ModelProvider interface) | Multimodal (text + image), structured JSON output |
| Text-to-speech | OpenAI TTS (tts-1) | Low-latency, natural voice |
| Screen capture | xcap (Rust) | Cross-platform native screen capture |
| Math rendering | KaTeX via rehype-katex | Fast LaTeX rendering in browser |
| Markdown | react-markdown + remark-gfm + remark-math | Full GFM + math support |
| Testing | Vitest (frontend) + Rust `#[cfg(test)]` (backend) | Fast, native test runners for both stacks |

## Data Flow

```
Student speaks "Hey TA, what's wrong with my integral?"
    │
    ▼
┌─────────┐    ┌──────────┐    ┌──────────────┐
│ Browser  │───▶│ VAD      │───▶│ Speech ends  │
│ Mic      │    │ (ONNX)   │    │ detected     │
└─────────┘    └──────────┘    └──────┬───────┘
                                      │
                               Float32Array audio
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Rust backend  │
                               │ → Whisper API │
                               └──────┬───────┘
                                      │
                               Transcript text
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Wake phrase   │
                               │ detection     │
                               │ "hey ta" ✓    │
                               └──────┬───────┘
                                      │
                              Question extracted
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                   │
                    ▼                 ▼                   ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │ Best webcam   │  │ Problem      │  │ Conversation │
           │ frame from    │  │ screenshot   │  │ history      │
           │ compositor    │  │ (if any)     │  │ (last 3)     │
           └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                  │                 │                   │
                  └─────────────────┼───────────────────┘
                                    │
                           Context assembly
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ GPT-4o           │
                           │ (streaming SSE)  │
                           │                  │
                           │ System: Tutoring │
                           │ policy prompt    │
                           │                  │
                           │ User: [images] + │
                           │ question + ctx   │
                           └────────┬─────────┘
                                    │
                           JSON response:
                           {spoken_blurb,
                            written_explanation}
                                    │
                    ┌───────────────┼───────────────┐
                    │                               │
                    ▼                               ▼
           ┌──────────────┐                ┌──────────────┐
           │ TTS API      │                │ Side panel   │
           │ → Web Audio  │                │ Markdown +   │
           │ → Speaker    │                │ KaTeX render │
           └──────────────┘                └──────────────┘
```

## Module Architecture

### Rust Backend (src-tauri/src/)

- **`lib.rs`** — App initialization, NSPanel overlay setup, global shortcut registration, command handler registration. Manages `CaptureState` and `StreamCancelFlag` as Tauri managed state.
- **`api.rs`** — All OpenAI API communication: Whisper transcription, GPT-4o streaming (SSE) with cancellation support, TTS audio fetch, native screenshot. Runs through Rust to bypass CORS and leverage async streaming. Includes `cancel_stream` command with atomic flag.
- **`capture.rs`** — Multi-monitor DPI-aware screen capture via xcap, overlay window creation for region selection, cropping with bounds clamping, and base64 encoding.
- **`window.rs`** — Window management: overlay positioning, dashboard creation/toggling with hide-on-close behavior, dynamic height resizing.
- **`error.rs`** — Typed error enum (`AppError`) with variants for Unauthorized, RateLimit, Api, Network, Encoding, Capture, Window, Cancelled, and Internal. Serializes to JSON with `error_type` and `status` fields so the frontend can handle errors programmatically.

### Frontend Services (src/services/)

- **`stt.ts`** — Audio blob → base64 → Rust Whisper invoke. Validates API key format and handles specific HTTP error codes (401/429/5xx) with user-friendly messages.
- **`tts.ts`** — Text → Rust TTS invoke → base64 MP3 → AudioContext decode → playback
- **`ai-response.ts`** — Async generator yielding SSE chunks from Tauri events via a zero-latency Promise-based async queue (no polling). Supports AbortSignal cancellation that propagates to the Rust `cancel_stream` command.
- **`context-builder.ts`** — Assembles multimodal message array for GPT-4o (system prompt, history, images, question)
- **`workspace-compositor.ts`** — Canvas-based webcam frame capture, grid pixel-diff stability scoring, best-frame selection
- **`session-logger.ts`** — In-memory interaction/session CRUD
- **`notes-generator.ts`** — GPT-4o-powered session recap from interaction timeline
- **`model-provider.ts`** — `ModelProvider` interface abstracting chat, transcription, and TTS. `OpenAIProvider` is the default implementation; adding a new provider (Anthropic, Ollama) requires only a new class.

### React Hooks (src/hooks/)

- **`useCamera`** — getUserMedia lifecycle, periodic frame capture, compositor integration
- **`useVoice`** — VAD event handling, STT transcription, wake/stop phrase state machine
- **`useTTS`** — Speak/stop with Web Audio cleanup
- **`useApiKeySync`** — API key persistence and cross-window synchronization via localStorage + storage events + polling fallback. Includes format validation.

### Key Design Decisions

1. **Rust for API calls**: All OpenAI HTTP requests go through the Tauri backend, not the browser. This avoids CORS issues and keeps the API key out of browser network inspector.

2. **Stability scoring for frame selection**: Instead of sending the latest webcam frame (which may show a hand mid-write), we maintain a rolling buffer of 10 frames and score each by pixel-grid stability (8x6 grid, per-cell luminance delta, threshold of 15). The most stable recent frame is sent to GPT-4o.

3. **Structured JSON output**: GPT-4o returns `{spoken_blurb, written_explanation}` — the blurb is sent to TTS immediately for fast perceived response, while the full explanation streams into the panel.

4. **NSPanel for overlay**: On macOS, the overlay bar uses NSPanel with `NSWindowStyleMaskNonActivatingPanel` so clicking the bar doesn't steal focus from the student's other apps.

5. **Wake phrase post-STT**: Rather than running a local wake word model, we transcribe all speech and check for "hey ta" in the transcript. Simpler and more reliable for a v1.

6. **Async queue for SSE streaming**: The `ai-response.ts` service uses a Promise-based async queue fed by Tauri event listeners, replacing the polling sleep pattern. Chunks are yielded to the consumer immediately when the event fires, eliminating busy-wait latency and potential race conditions.

7. **Typed error propagation**: The Rust backend uses a typed `AppError` enum that serializes with `error_type` and `status` fields. The frontend can programmatically distinguish between authentication failures, rate limits, and server errors rather than parsing error message strings.

8. **ModelProvider abstraction**: All AI interactions go through a `ModelProvider` interface. The current `OpenAIProvider` can be swapped for an Anthropic, Google, or local Ollama implementation without touching any business logic, UI components, or context assembly code.

## Scalability Considerations

Hey TA v1 is a single-user desktop application with deliberate v1 simplifications. Here we document the scaling limits and migration paths.

### Storage Estimates

| Component | Size per Interaction | Calculation |
|-----------|---------------------|-------------|
| Webcam frame (JPEG, 0.85 quality, 1280px) | ~120 KB | 1280x720 JPEG at 0.85 |
| Problem screenshot (PNG, cropped) | ~80 KB | Typical region selection |
| Transcript + AI response text | ~2 KB | ~500 tokens ≈ 2 KB |
| **Total per interaction** | **~200 KB** | |

### Session Size Projections

| Session Length | Interactions | In-Memory Size | Notes |
|---------------|-------------|----------------|-------|
| 30 min study session | ~10 | ~2 MB | Comfortable |
| 2 hour session | ~40 | ~8 MB | Still fine |
| 8 hour marathon | ~160 | ~32 MB | Approaching limit |
| **Breaking point** | **~500** | **~100 MB** | In-memory storage starts impacting performance |

### Migration Path (v2)

1. **Image storage**: Write images to disk (`~/.heyta/sessions/{id}/frames/`), store file paths in the database instead of base64 inline. This reduces DB size by ~99%.
2. **SQLite migration**: Replace in-memory arrays with `tauri-plugin-sql` (SQLite). Schema is already defined in MASTERPLAN.md. Expected migration effort: ~4 hours.
3. **History window justification**: The rolling 3-conversation window keeps the prompt under ~8K tokens (system prompt ~1K + 3 exchanges × ~2K each + current question ~1K). This leaves ~120K tokens for model output within GPT-4o's 128K context. Increasing to 5 exchanges would add ~4K tokens — viable but with diminishing returns on context relevance.

## Technical Innovation

### Pixel-Grid Stability Scoring

The workspace compositor implements a novel frame selection heuristic specifically designed for the paper-workspace observation use case. Rather than naively sending the latest webcam frame (which frequently shows a hand mid-write, pen tips, or motion blur), we:

1. **Divide each frame** into an 8×6 grid of cells
2. **Compute average luminance** per cell (sampling every 4th pixel for performance)
3. **Compare against the previous frame** using a per-cell intensity delta threshold (15)
4. **Score stability** as the fraction of cells below the threshold (0.0 = all changed, 1.0 = static)
5. **Select the highest-scoring frame** from a rolling 10-frame buffer

This is a practical and original engineering choice: it specifically filters out hand occlusion mid-write while preserving the clearest view of completed work. The 8×6 grid resolution means a student's hand covering ~25% of the frame only reduces stability to ~0.75, while active writing causes rapid full-grid changes that score near 0.0.

### Planned: Handwriting Region Detection (v2)

A lightweight local handwriting region detector would crop and sharpen the most relevant workspace region before sending to GPT-4o. This would:
- Reduce token cost by eliminating empty desk/whiteboard area (~60% of typical frames)
- Improve model accuracy by focusing attention on the written content
- Enable temporal compositing across frames to build a higher-resolution composite of the full workspace

Implementation approach: a small ONNX model (~5MB) running in the browser via `onnxruntime-web` (already a dependency for VAD) that outputs bounding boxes for written regions. This would differentiate Hey TA from any naive "screenshot and send" approach.

## Error Handling Architecture

```
Frontend (TypeScript)                    Backend (Rust)
┌──────────────────────┐                ┌──────────────────────┐
│  invoke("command")   │───────────────▶│  #[tauri::command]   │
│                      │                │  fn command()         │
│  catch(err) {        │◀───────────────│    -> Result<T,       │
│    if err.error_type │   AppError     │         AppError>     │
│       == "rate_limit"│   (serialized) │                      │
│    ...               │                │  AppError::RateLimit  │
│  }                   │                │  AppError::Api{..}    │
└──────────────────────┘                │  AppError::Network..  │
                                        └──────────────────────┘
```

All Rust commands return `Result<T, AppError>` where `AppError` serializes to:
```json
{
  "error_type": "rate_limit",
  "message": "Rate limited — please wait before retrying",
  "status": 429
}
```

The frontend can match on `error_type` to show specific UI (e.g., "Invalid API key" vs. "Rate limited — retry in 30s" vs. generic error).
