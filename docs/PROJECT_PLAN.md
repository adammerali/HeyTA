# Hey TA — Project Plan

## Problem Definition

Students working on math and science problems on paper or whiteboards have no quick way to get contextual help without breaking their workflow. Existing tools require typing problems into a computer, uploading photos manually, or switching contexts entirely. This interrupts the physical thinking process that pen-and-paper work enables.

The core insight: **the best tutoring happens in the student's workspace, not the computer's**. A teaching assistant who can *see* your work and *hear* your question — and respond in seconds — removes the friction between "I'm stuck" and "I understand."

### User Validation

This friction is well-documented in our own experience and informal interviews:

- *"I lose my train of thought every time I have to unlock my phone, open ChatGPT, take a photo, type context, and wait."* — University calculus student during user interview
- *"I wish I could just talk to someone while I'm working. Typing breaks the flow."* — High school AP Physics student, informal feedback session
- *"The worst part is re-explaining what I've already written. The AI can't see my paper."* — Team member who built the original Python prototype out of personal frustration

These quotes reflect a consistent pattern: the context-switching tax of moving between physical and digital workspaces is the primary barrier, not the quality of the AI itself.

## Vision

Hey TA is a desktop AI teaching assistant that lives as a floating overlay on macOS. It continuously observes the student's physical workspace through a webcam, listens for voice-activated help requests, and responds with both a quick spoken hint and a detailed written explanation with proper mathematical notation.

The product philosophy is **Socratic, not solutionist** — it guides students toward understanding rather than giving answers. It references the student's actual visible work ("I can see you wrote the integral as...") to make feedback concrete and actionable.

### Future Vision (v2+)

- **Cross-platform**: Windows and Linux support via standard always-on-top windows (replacing NSPanel)
- **Model-agnostic backend**: `ModelProvider` interface already implemented — swap in Anthropic Claude, Google Gemini, or a local Ollama instance with zero UI changes
- **Collaborative study sessions**: Multiple students share a session, see each other's questions and TA responses in real time
- **LMS integration**: Export session recaps to Canvas, Blackboard, or Google Classroom as study logs
- **Handwriting preprocessing**: Lightweight local model to detect, crop, and sharpen the most relevant workspace region before sending to the vision model — reduces token cost and improves accuracy
- **Mobile companion**: iOS/Android app that connects to the desktop session for on-the-go review

## Target Users

- University students working through problem sets (calculus, linear algebra, physics, etc.)
- High school students studying for exams with paper-based practice
- Self-learners working through textbooks who want on-demand help
- Anyone who works on a physical medium and wants AI tutoring without switching to a keyboard

## User Stories

1. **Voice-activated help**: As a student, I say "Hey TA, I'm stuck on this derivative" and within seconds hear a spoken hint, then see a full LaTeX-rendered explanation in a side panel.
2. **Workspace observation**: As a student, I point my webcam at my paper and TA can see my work, reference my specific errors, and give feedback grounded in what I actually wrote.
3. **Problem capture**: As a student, I screenshot a problem from a textbook PDF or homework site, and TA uses it as context when I ask for help.
4. **Session continuity**: As a student, my questions and TA's responses are logged in a timeline, so I can review what I learned during a study session.
5. **Session recap**: After a study session, I can generate study notes that summarize mistakes, corrections, and concepts to review.
6. **Non-intrusive UI**: As a student, the overlay bar is always visible but minimal — it doesn't block my work or steal focus from other apps.

## Competitive Landscape

| Dimension | Hey TA | ChatGPT Mobile (Camera) | Photomath | Wolfram Alpha | Google Lens |
|-----------|--------|-------------------------|-----------|---------------|-------------|
| **Ambient observation** | Always-on webcam with stability-scored frame selection | Manual: open app, point camera, take photo each time | Manual: point camera at a single equation | No camera support | Manual: point camera, single capture |
| **Voice activation** | Hands-free "Hey TA" wake phrase, zero keyboard interaction | Voice available but requires app switch + tap | No voice | No voice | Voice via Google Assistant only |
| **Socratic guidance** | System prompt enforces hint-first, guides toward understanding | Generic — answers directly unless manually prompted | Gives full solutions immediately | Gives full solutions | Identifies content, no tutoring |
| **Overlay / non-intrusive** | NSPanel floats above all apps without stealing focus | Full-screen app — must leave your workspace | Full-screen app | Browser tab | Full-screen app |
| **Multi-step context** | Rolling 3-exchange history + workspace + screenshot | Per-conversation history (but no workspace observation) | Single equation at a time | Single query | Single image |
| **Math rendering** | Full Markdown + KaTeX in side panel | Markdown in chat | Step-by-step UI | Mathematica output | Plain text |
| **Session review** | Timeline + AI-generated recap notes | Chat history (no summarization) | History of scanned problems | No history | No history |

**Key differentiator**: Hey TA is the only solution that combines ambient workspace observation, zero-friction voice activation, a non-focus-stealing overlay, and Socratic guidance in a single integrated experience. The closest alternative — taking a photo with ChatGPT mobile — requires ~45 seconds of manual context-switching per help request vs. Hey TA's ~8 seconds of purely voice-driven interaction.

## Differentiation Strategy

Unlike existing tools, Hey TA operates *inside* the student's workflow rather than requiring them to leave it:

- **vs. ChatGPT mobile**: Hey TA eliminates the 7-step manual process (unlock → open app → tap camera → position → capture → type context → wait). The student simply speaks while continuing to write.
- **vs. Photomath / Wolfram Alpha**: These are solution engines, not tutors. Hey TA's Socratic output format (spoken hint + detailed written explanation) builds understanding rather than providing answers to copy.
- **vs. Google Lens**: Lens identifies and retrieves; Hey TA observes, understands context from prior interactions, and teaches. The rolling conversation history means follow-up questions don't require re-explaining.
- **The NSPanel advantage**: On macOS, the overlay bar uses `NSWindowStyleMaskNonActivatingPanel`, meaning clicks on the bar don't steal keyboard focus from the student's other apps (textbook PDFs, homework websites). No other AI tutoring tool preserves application focus this way.

## Scope — v1 Deliverables

| Feature | Status | Priority |
|---------|--------|----------|
| Floating overlay bar (macOS NSPanel) | Implemented | P0 |
| Side panel dashboard with tabs | Implemented | P0 |
| Webcam workspace observation | Implemented | P0 |
| Workspace frame compositor with stability scoring | Implemented | P0 |
| Voice Activity Detection (browser VAD) | Implemented | P0 |
| Speech-to-Text (OpenAI Whisper) | Implemented | P0 |
| Wake phrase detection ("Hey TA") | Implemented | P0 |
| Multimodal AI (GPT-4o with images + text) | Implemented | P0 |
| Structured dual output (spoken hint + written explanation) | Implemented | P0 |
| Text-to-Speech (OpenAI TTS via Web Audio) | Implemented | P0 |
| Screen capture with region selection | Implemented | P0 |
| Markdown + LaTeX rendering (KaTeX) | Implemented | P0 |
| Global keyboard shortcuts (Cmd+Shift+H/S/P) | Implemented | P0 |
| Session interaction logging | Implemented | P1 |
| Interaction timeline UI | Implemented | P1 |
| Post-session recap generation | Implemented | P1 |
| Manual text input fallback | Implemented | P1 |
| ModelProvider abstraction (vendor-agnostic) | Implemented | P1 |
| CI pipeline (GitHub Actions) | Implemented | P1 |
| Unit tests (Vitest + Rust #[cfg(test)]) | Implemented | P1 |

## Out of Scope (v1)

- Multi-platform support (Windows/Linux) — macOS only for v1
- Persistent database storage (SQLite) — using in-memory for v1
- User accounts or cloud sync
- Collaborative/multi-student sessions
- Real-time handwriting OCR (we use GPT-4o vision instead)
- Mobile app

## Success Metrics

- **Time to first response**: < 5 seconds from end of question to spoken hint
- **Response relevance**: Responses reference visible workspace content (not generic)
- **Session utility**: Students can review session recap and identify what they learned
- **UX friction**: Zero keyboard interaction required for the core help loop (voice + camera only)

### Quantified Impact

| Metric | Manual workflow (ChatGPT mobile) | Hey TA | Improvement |
|--------|----------------------------------|--------|-------------|
| Time per help request | ~45s (unlock, open, photo, type, wait) | ~8s (speak, hear) | **82% reduction** |
| Keyboard interactions | 2+ (type question, tap send) | 0 (voice only) | **100% reduction** |
| Context re-entry | Full re-explanation every time | Automatic (camera + history) | **Eliminated** |
| Focus interruption | Full app switch | None (NSPanel overlay) | **Eliminated** |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Camera image quality too low for GPT-4o to read handwriting | Medium | High | Stability scoring selects clearest frame; user can reposition camera. **Fallback**: if model response contains "unable to read" or "can't see", automatically prompt user to reposition camera or switch to manual text input |
| Wake phrase false positives | Medium | Low | Conservative phrase matching; stop phrase to end capture |
| Whisper transcription errors | Low | Medium | Artifact filtering; manual text input as fallback |
| OpenAI API latency spikes | Medium | Medium | Streaming responses; spoken blurb delivered first for perceived speed |
| macOS permission dialogs confuse users | Low | Low | Clear first-launch guidance |
| **tauri-nspanel git-branch dependency** | Medium | High | The `tauri-nspanel` crate is sourced from a git branch (`v2`), not a versioned crate release. Risk of breaking changes or build failures under time pressure. **Fallback**: replace NSPanel with a standard Tauri `alwaysOnTop` window — loses the non-activating behavior but preserves all other functionality. Implementation requires changing only `lib.rs` (~20 lines) |
| **GPT-4o vision fails on handwriting** | Medium | High | Handwritten math at typical webcam quality (720p) may be partially illegible. **Fallback**: detect keywords in the model response ("unclear", "can't read", "blurry") and prompt the user: "I'm having trouble reading your work — try moving the camera closer or type your question instead." |

## Team Execution Plan

| Phase | Owner | Estimated Hours | Milestone |
|-------|-------|----------------|-----------|
| Phase 0 — Foundation & Scaffold | Adam | 3h | Repo setup, deps, build pipeline verified |
| Phase 1 — Desktop Shell & UI | Adam | 5h | Overlay bar + dashboard rendering, NSPanel working |
| Phase 2 — Camera & Compositor | Amil | 4h | Webcam feed, stability scoring, best-frame selection |
| Phase 3 — Voice Pipeline | Amil | 5h | VAD → recording → Whisper STT → wake phrase detection |
| Phase 4 — Screenshot Capture | Adam | 3h | Region selection overlay, capture-to-base64 |
| **MID-POINT CHECKPOINT** | **All** | **1h** | **Verify voice → model → TTS loop works end-to-end** |
| Phase 5 — Context Assembly & AI | Amil | 4h | Context builder, GPT-4o streaming, structured output |
| Phase 6 — TTS & Audio | Adam | 2h | OpenAI TTS → Web Audio playback pipeline |
| Phase 7 — Session Logging | Amil | 2h | In-memory logger, timeline UI, interaction CRUD |
| Phase 8 — Recap & Notes | Adam | 2h | Notes generator, recap tab in dashboard |
| Phase 9 — Integration & Polish | All | 4h | E2E testing, error handling, UI polish, docs |
| **TOTAL** | | **~35h** | 2–3 days for a 2-person team |

## Timeline

This is a v1 built in a compressed timeframe (~35 engineering hours across a 2-person team). All features listed above are implemented and the application compiles and builds successfully into a macOS `.app` and `.dmg`. The mid-point checkpoint after Phase 4 ensures the core voice→model→TTS loop is verified before investing in higher-level features.
