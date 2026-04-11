# HeyTA

An AI-powered teaching assistant that activates when you say **"Hey TA"** — combining your spoken question, whiteboard work, and on-screen problem to give instant, targeted feedback.

## Modules

| Module | Status | Location |
|---|---|---|
| Speech (wake phrase + transcription + LLM) | Complete | `speech/` |
| Desktop UI (overlay bar + chat window) | Complete | `ui/` |
| OpenCV whiteboard capture | In progress | `speech/main.py` integration point |
| Screen reader | In progress | `speech/main.py` integration point |

## Quick Start

### Speech module
```bash
cd speech
pip install -r requirements.txt
# Create .env with ANTHROPIC_API_KEY=your_key
python main.py
```

### Desktop UI
```bash
cd ui
npm install
npm run tauri dev
```

## Docs

See [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) for full project plan.
