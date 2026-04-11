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
| AI model | OpenAI GPT-4o | Multimodal (text + image), structured JSON output |
| Text-to-speech | OpenAI TTS (tts-1) | Low-latency, natural voice |
| Screen capture | xcap (Rust) | Cross-platform native screen capture |
| Math rendering | KaTeX via rehype-katex | Fast LaTeX rendering in browser |
| Markdown | react-markdown + remark-gfm + remark-math | Full GFM + math support |

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

- **`lib.rs`** — App initialization, NSPanel overlay setup, command registration
- **`api.rs`** — All OpenAI API communication: Whisper transcription, GPT-4o streaming (SSE), TTS audio fetch. Runs through Rust to bypass CORS and leverage async streaming.
- **`capture.rs`** — Multi-monitor screen capture via xcap, overlay window creation for region selection, cropping and base64 encoding
- **`window.rs`** — Window management: overlay positioning, dashboard creation/toggling, hide-on-close behavior

### Frontend Services (src/services/)

- **`stt.ts`** — Audio blob → base64 → Rust Whisper invoke
- **`tts.ts`** — Text → Rust TTS invoke → base64 MP3 → AudioContext decode → playback
- **`ai-response.ts`** — Async generator yielding SSE chunks from Tauri events
- **`context-builder.ts`** — Assembles multimodal message array for GPT-4o (system prompt, history, images, question)
- **`workspace-compositor.ts`** — Canvas-based webcam frame capture, grid pixel-diff stability scoring, best-frame selection
- **`session-logger.ts`** — In-memory interaction/session CRUD
- **`notes-generator.ts`** — GPT-4o-powered session recap from interaction timeline

### React Hooks (src/hooks/)

- **`useCamera`** — getUserMedia lifecycle, periodic frame capture, compositor integration
- **`useVoice`** — VAD event handling, STT transcription, wake/stop phrase state machine
- **`useTTS`** — Speak/stop with Web Audio cleanup

### Key Design Decisions

1. **Rust for API calls**: All OpenAI HTTP requests go through the Tauri backend, not the browser. This avoids CORS issues and keeps the API key out of browser network inspector.

2. **Stability scoring for frame selection**: Instead of sending the latest webcam frame (which may show a hand mid-write), we maintain a rolling buffer and score each frame by pixel-grid stability against the previous frame. The most stable recent frame is sent to GPT-4o.

3. **Structured JSON output**: GPT-4o returns `{spoken_blurb, written_explanation}` — the blurb is sent to TTS immediately for fast perceived response, while the full explanation streams into the panel.

4. **NSPanel for overlay**: On macOS, the overlay bar uses NSPanel with `NSWindowStyleMaskNonActivatingPanel` so clicking the bar doesn't steal focus from the student's other apps.

5. **Wake phrase post-STT**: Rather than running a local wake word model, we transcribe all speech and check for "hey ta" in the transcript. Simpler and more reliable for a v1.
