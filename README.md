# Hey TA

Real-time multimodal AI teaching assistant for physical workspaces. Point a camera at your paper or whiteboard, say "Hey TA" and ask a question, and get an instant spoken hint plus a detailed written explanation with LaTeX math.

## Setup & Run

### Prerequisites

- **macOS** (uses NSPanel for the overlay — macOS only for now)
- **Rust** — install via [rustup](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** — install via Homebrew: `brew install node`
- **OpenAI API key** — needed for Whisper (STT), GPT-4o (AI), and TTS

### Install & Run

```bash
# Clone and enter the repo
cd HeyTA

# Install frontend dependencies
npm install --legacy-peer-deps

# Run in dev mode (compiles Rust + starts Vite + launches the app)
npx tauri dev
```

That's it. On first launch, the app opens a settings panel where you enter your OpenAI API key.

### Build for Production

```bash
npx tauri build
```

Outputs a `.app` bundle and `.dmg` in `src-tauri/target/release/bundle/`.

### Run Tests

```bash
# Frontend unit tests (Vitest)
npm test

# Rust backend tests
cd src-tauri && cargo test
```

## API Key

You need **one key**: an **OpenAI API key** (`sk-...`).

This single key powers:
- **Whisper** — speech-to-text
- **GPT-4o** — multimodal tutoring (sees your workspace + reads your question)
- **TTS** — spoken responses

**Where to enter it**: When you first launch the app, the dashboard panel opens with a settings screen. Paste your key there and hit Save. It's stored in the browser's `localStorage` — stays on your machine, never sent anywhere except OpenAI's API. The key is validated for format (`sk-` prefix) before use.

There's no `.env` file needed. Everything goes through the in-app settings.

### macOS Permissions

On first run, macOS will ask for:
- **Camera access** — so TA can see your workspace
- **Microphone access** — so TA can hear your questions
- **Screen recording** (if you use screenshot) — for capturing problem images from your screen

Grant all three for the full experience.

## How to Use

1. **Launch the app** — a small floating bar appears at the top of your screen
2. **Click the camera icon** (or it auto-starts) — point your webcam at your paper/whiteboard
3. **Click the mic icon** — starts listening
4. **Say "Hey TA"** followed by your question — e.g. "Hey TA, what's wrong with my integral?"
5. **Hear a spoken hint** within seconds, and see the **full explanation with LaTeX** in the side panel
6. **Optionally screenshot** a problem from your screen using the screenshot button
7. **Review your session** in the History tab, or generate **study recap notes** in the Notes tab

You can also type questions directly in the text input at the bottom of the side panel.

### Global Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+H` | Toggle overlay bar visibility |
| `Cmd+Shift+P` | Toggle dashboard panel |
| `Cmd+Shift+S` | Take a screenshot |

## Project Structure

```
HeyTA/
├── src/                    # React frontend
│   ├── pages/              # OverlayBar, SidePanel
│   ├── components/         # Overlay, Markdown, AnswerCard, CameraPreview, Timeline
│   ├── hooks/              # useCamera, useVoice, useTTS, useApiKeySync
│   ├── services/           # STT, TTS, AI streaming, context builder, compositor, model provider
│   ├── contexts/           # Global app state (AppContext)
│   ├── lib/                # Utils, constants, tutoring prompts
│   │   └── __tests__/      # Unit tests (Vitest)
│   └── types/              # TypeScript interfaces
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # App init, NSPanel setup, global shortcuts
│       ├── api.rs          # OpenAI API (Whisper, GPT-4o streaming, TTS, cancel)
│       ├── capture.rs      # Screen capture (xcap, multi-monitor DPI)
│       ├── window.rs       # Window management
│       └── error.rs        # Typed error enum (AppError)
├── .github/workflows/      # CI pipeline (GitHub Actions)
├── docs/                   # Project plan, architecture, masterplan
└── speech/                 # Original Python prototype (reference)
```

## Architecture

The app is a **ModelProvider-agnostic** architecture — all AI interactions go through a `ModelProvider` interface with an `OpenAIProvider` implementation. Swapping to Anthropic, Google, or a local Ollama instance requires only a new provider class with zero changes to UI or business logic.

Key technical decisions:
- **Rust backend for API calls** — bypasses CORS, keeps API key out of browser network inspector
- **Pixel-grid stability scoring** — selects the clearest webcam frame (filtering out hand occlusion)
- **NSPanel overlay** — non-activating panel that preserves focus in student apps
- **Async queue for SSE** — zero-latency Promise-based event queue (no polling)
- **Typed error propagation** — `AppError` enum with `error_type` field for programmatic frontend handling

## Documentation

- [Project Plan](docs/PROJECT_PLAN.md) — problem definition, user stories, scope, competitive landscape, risks
- [Architecture](docs/ARCHITECTURE.md) — system design, data flow, scalability analysis, technology decisions
- [Master Implementation Plan](docs/MASTERPLAN.md) — detailed phase-by-phase build plan with API contracts
