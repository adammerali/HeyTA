# heyTA v1 — Master Implementation Plan

> **Last updated**: April 2026
> **Status**: Pre-implementation
> **Target**: Working v1 demo with full tutoring loop

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State](#2-current-state)
3. [Target Architecture](#3-target-architecture)
4. [Stack & Technology Choices](#4-stack--technology-choices)
5. [Repository Structure](#5-repository-structure)
6. [Phase 0 — Foundation & Scaffold](#6-phase-0--foundation--scaffold)
7. [Phase 1 — Desktop Shell & UI](#7-phase-1--desktop-shell--ui)
8. [Phase 2 — Camera & Workspace Observation](#8-phase-2--camera--workspace-observation)
9. [Phase 3 — Voice Pipeline](#9-phase-3--voice-pipeline)
10. [Phase 4 — Screenshot & Problem Capture](#10-phase-4--screenshot--problem-capture)
11. [Phase 5 — Context Builder & Model Orchestration](#11-phase-5--context-builder--model-orchestration)
12. [Phase 6 — TTS & Audio Response](#12-phase-6--tts--audio-response)
13. [Phase 7 — Session Logging & History](#13-phase-7--session-logging--history)
14. [Phase 8 — Post-Session Recap & Notes](#14-phase-8--post-session-recap--notes)
15. [Phase 9 — Integration & End-to-End Flow](#15-phase-9--integration--end-to-end-flow)
16. [Prompting Strategy](#16-prompting-strategy)
17. [Data Flow Diagrams](#17-data-flow-diagrams)
18. [API Contracts & Interfaces](#18-api-contracts--interfaces)
19. [v1 Simplifications & Corners Cut](#19-v1-simplifications--corners-cut)
20. [Risk Mitigation](#20-risk-mitigation)
21. [Demo Script](#21-demo-script)
22. [File Manifest](#22-file-manifest)

---

## 1. Executive Summary

heyTA is a multimodal tutoring assistant for physical math workspaces. A student works on paper or a whiteboard while a laptop camera observes. When the student says **"Hey T.A., ..."**, the system:

1. Captures the current workspace state (best clean frame from camera)
2. Optionally captures the source problem from the screen
3. Packages everything with the voice transcript and conversation history
4. Sends to a frontier multimodal model
5. Returns a **short spoken hint** (TTS) and a **longer written explanation** (Markdown + LaTeX in a side panel)
6. Logs the interaction for later review and session recap

The entire system runs as a single Tauri 2 desktop app — no external servers, no microservices. API keys for OpenAI are provided by the user.

---

## 2. Current State

### On `main` branch
- **`speech/`** — Python prototype with:
  - Wake phrase detection via `speech_recognition` + OpenAI Whisper
  - Streaming Claude (Anthropic) responses with sentence-level TTS
  - OpenAI TTS via PyAudio (streaming PCM)
  - OpenCV webcam single-frame capture
  - Working end-to-end voice loop (listen → transcribe → respond → speak)

### On `origin/ui-development` branch
- **`ui/`** — Tauri 2 + React 19 app with:
  - Floating overlay bar (transparent, NSPanel on macOS, non-activating)
  - Chat window with sidebar, conversation history, message bubbles
  - Basic Anthropic API integration (non-streaming, via Rust `reqwest`)
  - Drag handle, mic toggle, status indicator in overlay
  - Dark mode, Tailwind 4 styling

### What needs to happen
Merge both branches, then build the full v1 on the Tauri + React foundation. The Python code becomes a reference for logic; all production code moves to TypeScript (frontend) + Rust (Tauri backend).

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Tauri 2 Desktop App                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    React Frontend (Renderer)                  │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │   │
│  │  │ Overlay Bar  │  │  Side Panel   │  │ Screenshot Overlay │  │   │
│  │  │ (NSPanel)    │  │  (Dashboard)  │  │ (Capture Region)  │  │   │
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │   │
│  │         │                │                    │               │   │
│  │  ┌──────┴────────────────┴────────────────────┴───────────┐  │   │
│  │  │                   Shared Services                       │  │   │
│  │  │                                                         │  │   │
│  │  │  useCamera ─── WorkspaceCompositor                      │  │   │
│  │  │  useVoice ──── STT Service ──── Wake Phrase Detector    │  │   │
│  │  │  useTTS ────── TTS Service (Web Audio API)              │  │   │
│  │  │  ContextBuilder ──── ModelOrchestration                 │  │   │
│  │  │  SessionLogger ──── NotesGenerator                      │  │   │
│  │  └─────────────────────────┬───────────────────────────────┘  │   │
│  │                            │ invoke()                          │   │
│  └────────────────────────────┼──────────────────────────────────┘   │
│                               │                                      │
│  ┌────────────────────────────┼──────────────────────────────────┐   │
│  │                   Rust Backend (Tauri Commands)                │   │
│  │                                                                │   │
│  │  capture.rs ── Screen capture (xcap), region crop, base64     │   │
│  │  api.rs ────── SSE streaming to OpenAI, event emission        │   │
│  │  tts.rs ────── TTS audio fetch, PCM streaming                 │   │
│  │  window.rs ─── Window management, NSPanel, dashboard          │   │
│  │  db.rs ─────── SQLite via tauri-plugin-sql                    │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    External APIs                               │   │
│  │  OpenAI Whisper (STT) │ GPT-4o (multimodal) │ OpenAI TTS     │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Three Window Types

1. **Overlay Bar** (`label: "overlay"`) — Thin floating bar, always on top, non-activating NSPanel on macOS. Contains: drag handle, status dot, camera toggle, mic toggle, screenshot button, panel button, recap button.

2. **Side Panel / Dashboard** (`label: "dashboard"`) — Full window for written explanations, interaction history, camera preview, session notes. Opens on demand. Close hides (doesn't destroy).

3. **Capture Overlay** (`label: "capture-overlay-{n}"`) — Temporary fullscreen transparent overlay per monitor for screenshot region selection. Created/destroyed on demand.

---

## 4. Stack & Technology Choices

### Desktop Shell
- **Tauri 2** with `macos-private-api` for NSPanel transparency
- **tauri-nspanel** (v2 branch) for floating panel behavior on macOS
- Plugins: `tauri-plugin-sql` (SQLite), `tauri-plugin-opener`, `tauri-plugin-global-shortcut`

### Frontend
- **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **react-router-dom** for window routing
- **Lucide React** for icons
- **@ricky0123/vad-react** + **onnxruntime-web** for browser-side voice activity detection
- **react-markdown** + **remark-gfm** + **remark-math** + **rehype-katex** for math-aware markdown rendering
- **katex** CSS for equation styling

### Rust Backend (Tauri Commands)
- **xcap** for native screen capture
- **image** + **base64** for image processing and encoding
- **reqwest** for HTTP (API calls bypass CORS)
- **serde** / **serde_json** for serialization
- **hound** for WAV encoding (if needed for audio processing)
- **tokio** async runtime

### External APIs (all OpenAI for simplicity)
- **Whisper** (`whisper-1`) for speech-to-text
- **GPT-4o** for multimodal tutoring (images + text → structured response)
- **TTS** (`tts-1`, voice `shimmer`) for spoken hints

### Why This Stack
- Tauri gives us native-feel floating panels, screen capture, and content protection without Electron's overhead
- Keeping all API calls in Rust avoids CORS issues and lets us handle SSE streaming natively
- Browser `getUserMedia` for webcam is simpler than native camera bindings and works cross-platform
- VAD in the browser (via ONNX runtime) provides low-latency speech detection without a server
- Single API provider (OpenAI) simplifies key management and reduces integration surface

---

## 5. Repository Structure

```
heyta/
├── src/                           # React frontend source
│   ├── main.tsx                   # Entry: routes by window label
│   ├── App.tsx                    # Router for dashboard pages
│   ├── index.css                  # Global styles + Tailwind
│   ├── pages/
│   │   ├── OverlayBar.tsx         # Floating control bar
│   │   ├── SidePanel.tsx          # Dashboard: explanations + history + notes
│   │   └── Settings.tsx           # API key + camera + preferences
│   ├── components/
│   │   ├── ui/                    # Shared primitives (Button, Card, etc.)
│   │   ├── Markdown.tsx           # Math-aware markdown renderer
│   │   ├── Overlay.tsx            # Screenshot region selection
│   │   ├── AnswerCard.tsx         # Compact answer popup on overlay bar
│   │   ├── CameraPreview.tsx      # Small webcam PiP
│   │   ├── InteractionTimeline.tsx # Session history entries
│   │   └── AudioVisualizer.tsx    # Mic activity indicator
│   ├── hooks/
│   │   ├── useCamera.ts           # Webcam stream + frame capture
│   │   ├── useVoice.ts            # VAD + STT + wake phrase
│   │   ├── useTTS.ts              # Text-to-speech playback
│   │   ├── useCompletion.ts       # AI request lifecycle
│   │   └── useSession.ts          # Session state management
│   ├── services/
│   │   ├── stt.ts                 # Whisper API call
│   │   ├── tts.ts                 # OpenAI TTS + Web Audio playback
│   │   ├── ai-response.ts         # Streaming AI response (SSE)
│   │   ├── context-builder.ts     # Multimodal context packaging
│   │   ├── workspace-compositor.ts # Frame accumulation + best-frame selection
│   │   ├── session-logger.ts      # SQLite CRUD for sessions
│   │   └── notes-generator.ts     # Post-session recap generation
│   ├── lib/
│   │   ├── utils.ts               # cn(), floatArrayToWav, etc.
│   │   ├── constants.ts           # Wake phrases, tutoring policy, etc.
│   │   └── database.ts            # SQLite helpers
│   ├── contexts/
│   │   └── AppContext.tsx          # Global app state provider
│   └── types/
│       └── index.ts               # Shared TypeScript interfaces
├── src-tauri/                     # Rust backend
│   ├── src/
│   │   ├── main.rs                # Tauri entry point
│   │   ├── lib.rs                 # Plugin registration, commands, NSPanel setup
│   │   ├── capture.rs             # Screen capture via xcap
│   │   ├── api.rs                 # Streaming API calls (OpenAI SSE)
│   │   ├── tts.rs                 # TTS audio streaming
│   │   └── window.rs              # Window creation and management
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│       └── default.json
├── speech/                        # Original Python prototype (reference only)
│   ├── main.py
│   ├── listener.py
│   ├── feedback.py
│   ├── tts.py
│   └── requirements.txt
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example                   # OPENAI_API_KEY=sk-...
├── MASTERPLAN.md                  # This file
└── README.md
```

---

## 6. Phase 0 — Foundation & Scaffold

### Steps

1. **Merge branches**: Bring `origin/ui-development` into `main`. Move `ui/` contents to repo root so `src/`, `src-tauri/`, `package.json`, etc. live at the top level. Keep `speech/` as a reference subdirectory.

2. **Update Tauri config** (`tauri.conf.json`):
   - Keep the overlay window definition (600x54, transparent, no decorations, always on top)
   - Pre-define dashboard window config (960x700, hidden by default)
   - Add permissions for camera, microphone, screen capture
   - Set `macOSPrivateApi: true`

3. **Rust dependencies** (`Cargo.toml`):
   ```toml
   [dependencies]
   tauri = { version = "2", features = ["macos-private-api"] }
   tauri-plugin-opener = "2"
   tauri-plugin-sql = { version = "2", features = ["sqlite"] }
   tauri-plugin-global-shortcut = "2"
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   reqwest = { version = "0.12", features = ["json", "stream"] }
   tokio = { version = "1", features = ["full"] }
   xcap = "0.2"
   image = "0.25"
   base64 = "0.22"
   
   [target.'cfg(target_os = "macos")'.dependencies]
   tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2" }
   ```

4. **Frontend dependencies** (`package.json` additions):
   ```json
   {
     "dependencies": {
       "@ricky0123/vad-react": "^0.0.30",
       "onnxruntime-web": "^1.21.0",
       "react-markdown": "^9.0.0",
       "remark-gfm": "^4.0.0",
       "remark-math": "^6.0.0",
       "rehype-katex": "^7.0.0",
       "katex": "^0.16.0"
     }
   }
   ```

5. **Environment setup**:
   - `.env.example` with `OPENAI_API_KEY=`
   - Settings UI to input API key at runtime (stored in app state, never persisted to disk in plaintext)

---

## 7. Phase 1 — Desktop Shell & UI

### 7.1 Overlay Bar

The overlay bar is the primary always-visible control surface. It sits at the top-center of the screen as a thin floating panel.

**Layout (left to right):**

```
[≡ drag] [TA badge] [Hey TA] | [● status] | [📷 camera] [🎤 mic] [📸 screenshot] | [📋 panel] [💾 recap]
```

**State machine:**
- `idle` — Green dot, "Ready"
- `camera_active` — Camera icon lit, streaming frames to compositor
- `listening` — Blue pulsing dot, VAD active, "Listening..."
- `transcribing` — Spinner, "Transcribing..."
- `thinking` — Yellow pulsing dot, "Thinking..."
- `speaking` — Purple pulsing dot, "Speaking..."

**Key behaviors:**
- Non-activating: clicking the bar does not steal focus from the student's other apps
- Visible on all workspaces/spaces
- Draggable via the grip handle
- Each button dispatches to the relevant hook/service

**Compact answer card:**
When the model responds, a small expandable card appears below the overlay bar showing the `spoken_blurb` text. Clicking it opens the full side panel. Auto-dismisses after 10 seconds if not interacted with.

### 7.2 Side Panel (Dashboard)

Separate Tauri window, opened by the panel button or by clicking the answer card.

**Tabs:**
1. **Current** — Latest answer: written explanation rendered in Markdown + KaTeX, with workspace snapshot and screenshot thumbnails above
2. **History** — Scrollable timeline of all session interactions, each with timestamp, question, and expandable response
3. **Notes** — Post-session recap (generated on demand), study summary, concepts covered

**UI structure:**
- Top bar: session timer, workspace mode indicator (paper/whiteboard), close button
- Camera PiP: small live preview in corner (toggleable)
- Content area: tab-switched

**Window management:**
- Created once at startup (hidden)
- Show/hide on toggle (not create/destroy) for instant appearance
- Close button hides rather than destroys

### 7.3 Markdown Renderer

Custom component that handles:
- Standard markdown (headings, lists, code blocks, bold/italic)
- GFM (tables, strikethrough, task lists)
- **LaTeX math** via remark-math + rehype-katex (inline `$...$` and display `$$...$$`)
- Syntax highlighting for code blocks
- Responsive sizing for the side panel

---

## 8. Phase 2 — Camera & Workspace Observation

### 8.1 Camera Hook (`useCamera`)

```typescript
interface UseCameraReturn {
  isActive: boolean;
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  captureFrame: () => string | null; // base64 JPEG
}
```

**Implementation:**
- Uses `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 720 } })`
- Attaches stream to a hidden `<video>` element
- `captureFrame()` draws current video frame to an offscreen `<canvas>`, exports as JPEG base64
- Handles permission requests gracefully
- Cleanup on unmount

### 8.2 Workspace Compositor (`workspace-compositor.ts`)

The compositor maintains the best current estimate of the workspace content.

**Core approach for v1:**

Rather than complex temporal compositing, we use a **best-frame selection** strategy:

1. Every 2 seconds while camera is active, capture a frame
2. Compute a simple "stability score" by comparing pixel differences with the previous frame
3. Keep a rolling buffer of the last 10 frames with their stability scores
4. When the user asks for help, select the frame with the highest stability score (least motion = least hand occlusion)
5. Also keep the very latest frame as a fallback

```typescript
interface WorkspaceState {
  compositeImage: string;      // best stable frame (base64)
  latestSnapshot: string;      // most recent frame
  changedRegions: BoundingBox[]; // approximate areas of recent change
  frameCount: number;
  lastCaptureTime: number;
}
```

**Stability scoring (simple heuristic):**
- Divide frame into a grid (e.g., 8x6)
- For each cell, compute average pixel intensity
- Compare with previous frame's grid
- Cells with large differences = motion (hand, writing in progress)
- Frame stability = percentage of cells that are unchanged
- Score > 0.85 = very stable (good candidate)

**Why this works for v1:**
- GPT-4o is excellent at interpreting slightly noisy workspace images
- The "best recent frame" approach avoids the complexity of true compositing
- The stability heuristic filters out frames where the student's hand covers the work
- If no stable frame exists, the latest frame still provides useful context

### 8.3 Camera Preview Component

Small PiP in the side panel corner showing what the camera sees. Uses the same video stream. Helps the student verify camera positioning.

---

## 9. Phase 3 — Voice Pipeline

### 9.1 Voice Activity Detection

Use `@ricky0123/vad-react` which runs a small ONNX model in the browser for real-time voice activity detection.

```typescript
const vad = useMicVAD({
  startOnLoad: true,
  userSpeakingThreshold: 0.6,
  onSpeechEnd: async (audioFloat32) => {
    const wavBlob = floatArrayToWav(audioFloat32, 16000, "wav");
    const transcription = await fetchSTT(wavBlob, apiKey);
    handleTranscription(transcription);
  },
});
```

**VAD behavior:**
- Runs continuously when mic is enabled
- Detects speech start/end automatically
- On speech end, provides the audio segment as Float32Array
- We convert to WAV and send to Whisper

### 9.2 Speech-to-Text (`stt.ts`)

Direct call to OpenAI Whisper API. No curl parsing, no provider abstraction — hardcoded for simplicity.

```typescript
export async function fetchSTT(audio: Blob, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", audio, "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("language", "en");
  
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });
  
  const data = await response.json();
  return data.text?.trim() || "";
}
```

For CORS bypass, if needed, route through Rust:
```rust
#[tauri::command]
async fn transcribe_audio(audio_base64: String, api_key: String) -> Result<String, String> {
    // Decode base64 → WAV bytes, multipart POST to Whisper, return text
}
```

### 9.3 Wake Phrase Detection

After Whisper returns a transcription, check for wake phrase:

```typescript
const WAKE_PHRASES = [
  "hey ta", "hey t.a.", "hey t.a", "hey tea", "hey t a",
  "hey tee a", "hey tee ay", "hey tay", "hay ta", "hey da",
];

function detectWakePhrase(text: string): { detected: boolean; question: string } {
  const lower = text.toLowerCase();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      return { detected: true, question: text.slice(idx + phrase.length).trim() };
    }
  }
  return { detected: false, question: "" };
}
```

### 9.4 Voice Flow State Machine

```
                  ┌─────────┐
                  │  IDLE    │ (VAD active, listening for speech)
                  └────┬────┘
                       │ speech detected
                       ▼
                  ┌─────────┐
                  │ CAPTURE  │ (recording speech segment)
                  └────┬────┘
                       │ speech ends (VAD)
                       ▼
                ┌───────────┐
                │ TRANSCRIBE │ (Whisper API)
                └─────┬─────┘
                      │
              ┌───────┴───────┐
              │               │
        wake phrase?     no wake phrase
              │               │
              ▼               ▼
     ┌────────────┐    ┌──────────┐
     │ BUILD CTX   │    │ BUFFER   │ (add to transcript window, return to IDLE)
     │ + ASK MODEL │    └──────────┘
     └──────┬─────┘
            │
            ▼
     ┌──────────┐
     │ RESPOND   │ (TTS spoken_blurb + display written_explanation)
     └──────┬───┘
            │
            ▼
       back to IDLE
```

**Continuous listening mode (alternative):**
Instead of single-utterance detection, support a mode where after wake phrase, the system continues capturing until a stop phrase ("thank you", "stop", "got it"). All captured speech between wake and stop is concatenated as the full question. This matches the existing Python prototype behavior.

### 9.5 Transcript Window

Maintain a rolling window of the last N transcriptions (even non-wake ones). This provides background context to the model about what the student has been saying/mumbling while working.

```typescript
const recentTranscripts: { text: string; timestamp: number }[] = [];
// Keep last 5 minutes or last 20 utterances, whichever is smaller
```

---

## 10. Phase 4 — Screenshot & Problem Capture

### 10.1 Rust Screenshot Module (`capture.rs`)

Full screen capture using `xcap`:

**Commands:**
- `capture_to_base64` — Instant full-screen capture, returns base64 PNG
- `start_screen_capture` — Captures all monitors, creates overlay windows for region selection
- `capture_selected_area(coords, monitor_index)` — Crops stored capture to selection, returns base64, destroys overlays
- `close_overlay_window` — Cleanup overlays

**CaptureState:**
```rust
pub struct CaptureState {
    pub captured_monitors: Arc<Mutex<HashMap<usize, MonitorInfo>>>,
    pub overlay_active: Arc<AtomicBool>,
}
```

This handles multi-monitor setups, DPI scaling, and proper cleanup.

### 10.2 Region Selection Overlay (`Overlay.tsx`)

Fullscreen transparent window that lets the user draw a rectangle to select a region.

**Behavior:**
- Mouse down: start selection
- Mouse move: draw rectangle overlay
- Mouse up: calculate coordinates (scaled by device pixel ratio), invoke `capture_selected_area`
- Escape: cancel, invoke `close_overlay_window`
- Coordinates sent back to Rust include DPR scaling for pixel-perfect crops

### 10.3 Screenshot Integration in Overlay Bar

Screenshot button behavior:
1. Click → `start_screen_capture` (region selection mode)
2. User selects region → `capture_selected_area` → base64 PNG
3. Image stored in context builder as `problemImage`
4. Small thumbnail appears in overlay bar and side panel
5. Used in next model request as problem context

**Quick capture mode** (optional): Cmd+Shift+S → instant full-screen capture without region selection.

### 10.4 macOS Permissions

Screen recording permission is required on macOS. Check and request at first screenshot attempt:
```typescript
import { checkScreenRecordingPermission, requestScreenRecordingPermission } 
  from "tauri-plugin-macos-permissions-api";
```

---

## 11. Phase 5 — Context Builder & Model Orchestration

### 11.1 Context Builder (`context-builder.ts`)

The context builder packages all available signals into a structured request.

```typescript
interface TutoringRequest {
  // Core
  userQuestion: string;
  workspaceImage: string;           // base64 from compositor
  
  // Optional enrichment
  problemImage?: string;            // base64 from screenshot
  recentTranscripts: string[];      // last few utterances for context
  conversationHistory: ConversationEntry[];
  
  // Configuration
  subject: "math";
  responseMode: "hint_first" | "full_explanation";
  tutoringPolicy: string;
}

interface ConversationEntry {
  role: "user" | "assistant";
  question: string;
  spokenBlurb: string;
  writtenExplanation: string;
  timestamp: number;
}
```

**Building the multimodal message:**

```typescript
function buildMessages(request: TutoringRequest): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  
  // System message with tutoring policy
  messages.push({ role: "system", content: request.tutoringPolicy });
  
  // Conversation history (last 3 exchanges)
  for (const entry of request.conversationHistory.slice(-3)) {
    messages.push({ role: "user", content: entry.question });
    messages.push({ role: "assistant", content: entry.writtenExplanation });
  }
  
  // Current request with images
  const userContent: ContentPart[] = [];
  
  // Workspace image (always included)
  userContent.push({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${request.workspaceImage}` }
  });
  
  // Problem image (if available)
  if (request.problemImage) {
    userContent.push({
      type: "text",
      text: "The following image shows the source problem or reference material:"
    });
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${request.problemImage}` }
    });
  }
  
  // Transcript context
  if (request.recentTranscripts.length > 0) {
    userContent.push({
      type: "text",
      text: `Recent things the student said: ${request.recentTranscripts.join(" | ")}`
    });
  }
  
  // The actual question
  userContent.push({
    type: "text",
    text: `Student's question: ${request.userQuestion}`
  });
  
  messages.push({ role: "user", content: userContent });
  
  return messages;
}
```

### 11.2 Model Orchestration (`ai-response.ts`)

Streaming API call via Rust backend (avoids CORS, handles SSE natively).

**Rust side (`api.rs`):**
```rust
#[tauri::command]
async fn chat_stream_response(
    app: tauri::AppHandle,
    api_key: String,
    messages_json: String,
    model: String,
) -> Result<(), String> {
    // POST to OpenAI chat/completions with stream: true
    // Parse SSE lines: data: {"choices":[{"delta":{"content":"..."}}]}
    // Emit "chat_stream_chunk" events to frontend
    // Emit "chat_stream_complete" when done
}
```

**Frontend side:**
```typescript
async function* streamTutoringResponse(request: TutoringRequest): AsyncGenerator<string> {
  const messages = buildMessages(request);
  
  // Set up event listeners for streaming chunks
  const chunks: string[] = [];
  let complete = false;
  
  const unlisten = await listen("chat_stream_chunk", (event) => {
    chunks.push(event.payload as string);
  });
  const unlistenComplete = await listen("chat_stream_complete", () => {
    complete = true;
  });
  
  // Start the stream
  await invoke("chat_stream_response", {
    apiKey: getApiKey(),
    messagesJson: JSON.stringify(messages),
    model: "gpt-4o",
  });
  
  // Yield chunks as they arrive
  let idx = 0;
  while (!complete) {
    await sleep(50);
    for (let i = idx; i < chunks.length; i++) {
      yield chunks[i];
    }
    idx = chunks.length;
  }
  
  // Yield remaining
  for (let i = idx; i < chunks.length; i++) {
    yield chunks[i];
  }
  
  unlisten();
  unlistenComplete();
}
```

### 11.3 Structured Output Parsing

The model is instructed to return JSON with two fields. We parse the streamed response:

```typescript
interface TutoringResponse {
  spoken_blurb: string;
  written_explanation: string;
}

function parseTutoringResponse(fullText: string): TutoringResponse {
  try {
    // Try JSON parse first
    const parsed = JSON.parse(fullText);
    return {
      spoken_blurb: parsed.spoken_blurb || parsed.spokenBlurb || "",
      written_explanation: parsed.written_explanation || parsed.writtenExplanation || "",
    };
  } catch {
    // Fallback: treat entire response as written, generate spoken from first 2 sentences
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    return {
      spoken_blurb: sentences.slice(0, 2).join(" ").trim(),
      written_explanation: fullText,
    };
  }
}
```

### 11.4 Abort & Request Management

Maintain an `AbortController` per request. New requests cancel previous ones. The Rust side checks for cancellation signals via event listeners.

---

## 12. Phase 6 — TTS & Audio Response

### 12.1 TTS Service (`tts.ts`)

Port of the Python `tts.py` to browser-side Web Audio:

```typescript
export class TTSService {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  
  async speak(text: string, apiKey: string): Promise<void> {
    this.stop(); // Cancel any current playback
    
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    
    // Fetch audio from OpenAI TTS
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "shimmer",
        input: text,
        response_format: "mp3", // mp3 is easier to decode in browser than raw PCM
      }),
    });
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);
    this.currentSource.start();
  }
  
  stop(): void {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
  }
}
```

**Alternative: Rust-side TTS** (if CORS blocks frontend):
```rust
#[tauri::command]
async fn fetch_tts_audio(text: String, api_key: String) -> Result<Vec<u8>, String> {
    // POST to OpenAI TTS, return raw audio bytes
    // Frontend receives via Tauri event, decodes with Web Audio API
}
```

### 12.2 TTS Hook (`useTTS.ts`)

```typescript
interface UseTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
}
```

### 12.3 Audio Flow

1. Model returns `spoken_blurb` (extracted from structured JSON)
2. `speak(spoken_blurb)` called immediately
3. User hears short hint while reading longer explanation in panel
4. Playback is interruptible (new request or explicit stop cancels)

---

## 13. Phase 7 — Session Logging & History

### 13.1 Database Schema

Using SQLite via `tauri-plugin-sql`:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  workspace_mode TEXT DEFAULT 'paper',
  title TEXT
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  user_question TEXT NOT NULL,
  spoken_response TEXT,
  written_response TEXT,
  workspace_snapshot TEXT,    -- base64 JPEG (compressed)
  screenshot TEXT,            -- base64 PNG
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 13.2 Session Logger Service

```typescript
class SessionLogger {
  private db: Database;
  private currentSessionId: string | null = null;
  
  async startSession(workspaceMode: "paper" | "whiteboard"): Promise<string>;
  async logInteraction(data: InteractionData): Promise<void>;
  async endSession(): Promise<void>;
  async getSessionHistory(sessionId: string): Promise<Interaction[]>;
  async getAllSessions(): Promise<SessionSummary[]>;
}
```

### 13.3 Interaction Timeline Component

Each interaction entry in the history shows:
- Timestamp (relative: "2 min ago")
- User question text
- Small workspace thumbnail (clickable to expand)
- Written response (collapsed by default, expandable)
- "Play" button to re-hear the spoken response

---

## 14. Phase 8 — Post-Session Recap & Notes

### 14.1 Notes Generator (`notes-generator.ts`)

Triggered by the "Recap" button in the overlay bar or the Notes tab in the side panel.

```typescript
async function generateSessionRecap(
  sessionId: string,
  apiKey: string,
): Promise<SessionRecap> {
  const history = await sessionLogger.getSessionHistory(sessionId);
  
  const prompt = `You are generating study notes from a tutoring session.
  The student was working on math problems. Here is the session timeline:
  
  ${history.map(h => `
  [${new Date(h.timestamp).toLocaleTimeString()}]
  Question: ${h.userQuestion}
  Response: ${h.writtenResponse}
  `).join("\n---\n")}
  
  Generate:
  1. A concise session summary (2-3 sentences)
  2. Key concepts covered (bullet list)
  3. Mistakes identified and corrections made
  4. Recommended follow-up study topics
  
  Use LaTeX notation for math (e.g., $\\frac{d}{dx}$).
  `;
  
  // Single GPT-4o call (non-streaming, this can be slow)
  const response = await invoke("send_message", { apiKey, prompt, model: "gpt-4o" });
  return parseRecap(response);
}
```

### 14.2 Notes Display

Rendered in the "Notes" tab of the side panel using the same Markdown + KaTeX renderer. Includes:
- Session summary card
- Concepts list with checkboxes (student can mark as "understood")
- Mistake → correction pairs
- Follow-up topics

---

## 15. Phase 9 — Integration & End-to-End Flow

### 15.1 The Complete Help Request Flow

```
1. Student says "Hey TA, why is step 3 wrong?"
                │
2. VAD detects speech end
                │
3. Audio → Whisper → "Hey TA why is step 3 wrong"
                │
4. Wake phrase detected → extract "why is step 3 wrong"
                │
5. WorkspaceCompositor.getBestFrame() → workspace_image
                │
6. (If screenshot exists) → problem_image
                │
7. ContextBuilder.build({
     userQuestion: "why is step 3 wrong",
     workspaceImage: <base64>,
     problemImage: <base64>,
     recentTranscripts: [...],
     conversationHistory: [...],
     tutoringPolicy: TUTORING_POLICY
   })
                │
8. → OpenAI GPT-4o (streaming)
                │
9. Parse response → { spoken_blurb, written_explanation }
                │
10. TTS.speak(spoken_blurb)     → audio plays through speakers
    Panel.show(written_explanation) → markdown renders in side panel
    OverlayBar.showCard(spoken_blurb) → compact card appears
    SessionLogger.log(...)      → saved to SQLite
                │
11. Student hears hint, reads explanation, continues working
```

### 15.2 Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+H` | Toggle mic / VAD |
| `Cmd+Shift+S` | Quick screenshot |
| `Cmd+Shift+P` | Toggle side panel |
| `Cmd+Shift+R` | Generate recap |
| `Escape` | Cancel current request / close overlay |

### 15.3 State Management

Single `AppContext` provider with:
- `apiKey` — OpenAI key (from settings)
- `isListening` — VAD active
- `isCameraActive` — Webcam streaming
- `status` — Current state machine position
- `currentResponse` — Latest model output
- `sessionId` — Active session
- `conversationHistory` — Rolling history
- `workspaceState` — Compositor output
- `problemScreenshot` — Latest screenshot base64

---

## 16. Prompting Strategy

### 16.1 System Prompt (Tutoring Policy)

```
You are TA, a real-time teaching assistant helping a student who is working on 
math problems on physical paper or a whiteboard. You can see their workspace 
through a camera.

RESPONSE FORMAT:
You MUST respond with valid JSON containing exactly two fields:
{
  "spoken_blurb": "A short 1-2 sentence hint (15-25 seconds when spoken aloud). 
                   Conversational, encouraging, one key insight plus one next step.",
  "written_explanation": "A detailed explanation in Markdown with LaTeX math 
                          (use $...$ for inline, $$...$$ for display). Include:
                          - What the student did correctly
                          - Where they went wrong (reference specific work visible in the image)
                          - The correct approach, explained step by step
                          - A check: what the answer should look like
                          Do NOT give the full solution unless the student explicitly asks."
}

TUTORING RULES:
1. Always reference the student's actual visible work. Say "I can see you wrote..." 
   not generic advice.
2. Guide toward the answer — don't give it away. Socratic approach.
3. If you can see a specific error, name it precisely.
4. If the workspace image is unclear, say so and ask the student to clarify or 
   reposition the camera.
5. Keep spoken_blurb warm and encouraging. No jargon overload.
6. In written_explanation, use proper LaTeX for all equations.
7. If a problem screenshot is provided, ground your response in that specific problem.
8. If context is insufficient to help, ask a targeted clarifying question.
```

### 16.2 Post-Session Recap Prompt

```
You are generating study recap notes from a math tutoring session. The student 
worked on problems on paper/whiteboard and asked their AI teaching assistant 
for help multiple times during the session.

Given the session timeline below, produce:
1. **Session Summary** — 2-3 sentence overview of what was covered
2. **Key Concepts** — Bullet list of mathematical concepts encountered
3. **Mistakes & Corrections** — For each mistake the student made:
   - What they did wrong
   - The correct approach
   - The underlying misconception
4. **Study Recommendations** — What to review next, based on the session

Format everything in Markdown with LaTeX math notation.
```

---

## 17. Data Flow Diagrams

### 17.1 Realtime Tutoring Path

```
Camera ──(2s intervals)──> Compositor ──(on request)──> best_frame
                                                            │
Mic ──(continuous)──> VAD ──(speech end)──> Whisper STT     │
                                               │            │
                                          transcription     │
                                               │            │
                                     wake phrase check      │
                                               │            │
                              ┌────yes─────────┴────no──────┐
                              │                              │
                        Context Builder              Transcript Buffer
                              │                       (for background context)
                              │
                    ┌─────────┴──────────┐
                    │   GPT-4o Request   │
                    │   (images + text)  │
                    └─────────┬──────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Parse structured  │
                    │  JSON response     │
                    └───┬────────────┬───┘
                        │            │
                  spoken_blurb  written_explanation
                        │            │
                   TTS Service   Side Panel
                        │         + Answer Card
                   Audio plays    Markdown renders
                        │            │
                        └────────┬───┘
                                 │
                          Session Logger
                          (SQLite write)
```

### 17.2 Post-Session Path

```
Session Logger (read all interactions)
              │
              ▼
    GPT-4o (recap prompt + full history)
              │
              ▼
    Structured Recap (Markdown + LaTeX)
              │
              ▼
    Notes Tab in Side Panel
```

---

## 18. API Contracts & Interfaces

### 18.1 Tauri Commands (Rust → Frontend)

```typescript
// Screenshot
invoke("capture_to_base64"): Promise<string>
invoke("start_screen_capture"): Promise<void>
invoke("capture_selected_area", { coords, monitorIndex }): Promise<string>
invoke("close_overlay_window"): Promise<void>

// AI
invoke("chat_stream_response", { apiKey, messagesJson, model }): Promise<void>
// Emits: "chat_stream_chunk" (string), "chat_stream_complete" (void)

// TTS
invoke("fetch_tts_audio", { text, apiKey, voice }): Promise<string> // base64 audio

// Window
invoke("open_dashboard"): Promise<void>
invoke("close_dashboard"): Promise<void>

// STT (optional, if CORS blocks frontend)
invoke("transcribe_audio", { audioBase64, apiKey }): Promise<string>
```

### 18.2 Core TypeScript Interfaces

```typescript
interface TutoringResponse {
  spoken_blurb: string;
  written_explanation: string;
}

interface Interaction {
  id: string;
  sessionId: string;
  timestamp: number;
  userQuestion: string;
  spokenResponse: string;
  writtenResponse: string;
  workspaceSnapshot?: string;
  screenshot?: string;
}

interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  workspaceMode: "paper" | "whiteboard";
  title?: string;
  interactions: Interaction[];
}

interface WorkspaceState {
  compositeImage: string;
  latestSnapshot: string;
  isActive: boolean;
  frameCount: number;
}

interface AppState {
  apiKey: string;
  status: "idle" | "listening" | "transcribing" | "thinking" | "speaking";
  isListening: boolean;
  isCameraActive: boolean;
  currentSession: Session | null;
  currentResponse: TutoringResponse | null;
  workspaceState: WorkspaceState;
  problemScreenshot: string | null;
  conversationHistory: Interaction[];
  recentTranscripts: string[];
}
```

---

## 19. v1 Simplifications & Corners Cut

These are deliberate scope reductions for v1 that keep the system buildable:

| Area | Full Vision | v1 Approach |
|------|------------|-------------|
| Workspace compositing | Perspective-corrected temporal composite with hand removal | Best-frame selection by stability score |
| Wake phrase | Always-on keyword spotting model | Post-STT string matching (slight latency) |
| TTS streaming | Chunk-by-chunk PCM streaming playback | Fetch full MP3, then play (1-2s delay for short blurbs) |
| Session storage | Efficient image storage with references | Base64 inline in SQLite (works for demo-length sessions) |
| Model fallback | Multi-provider with automatic failover | OpenAI only; Claude as manual setting |
| Architecture | Microservices, background workers | Everything in-process (Tauri + React) |
| Post-session notes | Multi-step pipeline with handwriting reconstruction | Single GPT-4o prompt |
| Subject support | Multi-subject with specialized prompts | Math only |
| Camera modes | Paper + whiteboard with mode-specific processing | Single mode, user positions camera |

---

## 20. Risk Mitigation

### Workspace image quality
- **Risk**: Camera at bad angle, poor lighting, hand covers work
- **Mitigation**: Best-frame selection filters hand occlusion; camera preview helps user position; model handles noise well; screenshot of source problem provides strong fallback grounding

### Model over-solving
- **Risk**: GPT-4o gives the full answer instead of hinting
- **Mitigation**: Strict tutoring policy in system prompt; structured JSON forces separate spoken (short) and written (longer but still guided) outputs; `do_not_fully_solve` default

### Latency
- **Risk**: VAD → Whisper → GPT-4o → TTS takes too long
- **Mitigation**: VAD runs locally (no network); Whisper-1 is fast (~1-2s); GPT-4o streaming starts yielding quickly; TTS is only for the short blurb (~15s of audio); answer card shows immediately while TTS loads

### CORS / API access
- **Risk**: Browser cannot directly call OpenAI APIs
- **Mitigation**: All API calls routed through Rust/Tauri `invoke` commands, which use `reqwest` and bypass CORS entirely

### Wake phrase accuracy
- **Risk**: Whisper misrecognizes "Hey TA" 
- **Mitigation**: Broad variant list (12 phrases); explicit mic button as fallback; Whisper is good at English phrases with context

---

## 21. Demo Script

For presenting v1:

1. **Setup** (30s): Open heyTA. Camera shows a desk with a calculus problem on paper. Point out the floating overlay bar.

2. **Problem capture** (15s): Click screenshot button, select the textbook problem on screen. Thumbnail appears in the bar.

3. **Work on problem** (30s): Student writes derivative steps on paper. Camera captures frames (green indicator shows camera is active).

4. **Ask for help** (15s): Say "Hey TA, I think I made an error in step 3, can you check?" System shows transcribing → thinking status.

5. **Receive help** (20s): Short spoken hint plays ("I can see you applied the chain rule in step 3, but you forgot to multiply by the inner derivative. Try differentiating the inside function separately."). Written explanation appears in side panel with LaTeX equations.

6. **Continue working** (20s): Student corrects the step. Asks another question. Cycle repeats.

7. **Session recap** (15s): Click recap button. Notes tab shows session summary, concepts covered, corrections made.

**Total demo: ~2.5 minutes**

---

## 22. File Manifest

Complete list of files to create or modify:

### New Files
- `src/pages/SidePanel.tsx`
- `src/pages/Settings.tsx`
- `src/components/Markdown.tsx`
- `src/components/Overlay.tsx`
- `src/components/AnswerCard.tsx`
- `src/components/CameraPreview.tsx`
- `src/components/InteractionTimeline.tsx`
- `src/components/AudioVisualizer.tsx`
- `src/hooks/useCamera.ts`
- `src/hooks/useVoice.ts`
- `src/hooks/useTTS.ts`
- `src/hooks/useCompletion.ts`
- `src/hooks/useSession.ts`
- `src/services/stt.ts`
- `src/services/tts.ts`
- `src/services/ai-response.ts`
- `src/services/context-builder.ts`
- `src/services/workspace-compositor.ts`
- `src/services/session-logger.ts`
- `src/services/notes-generator.ts`
- `src/lib/constants.ts`
- `src/lib/database.ts`
- `src/types/index.ts`
- `src-tauri/src/capture.rs`
- `src-tauri/src/api.rs`
- `src-tauri/src/tts.rs`
- `src-tauri/src/window.rs`
- `.env.example`

### Modified Files
- `src/main.tsx` — Add window label routing for overlay, dashboard, capture-overlay
- `src/App.tsx` — Add routes for side panel, settings
- `src/pages/OverlayBar.tsx` — Full expansion with all controls
- `src/contexts/AppContext.tsx` — Complete state management
- `src-tauri/src/lib.rs` — Register all commands, plugins, NSPanel setup
- `src-tauri/Cargo.toml` — Add all Rust dependencies
- `src-tauri/tauri.conf.json` — Window definitions, permissions
- `package.json` — Add all frontend dependencies
- `README.md` — Setup instructions

### Reference (unchanged)
- `speech/main.py`
- `speech/listener.py`
- `speech/feedback.py`
- `speech/tts.py`
- `speech/requirements.txt`
