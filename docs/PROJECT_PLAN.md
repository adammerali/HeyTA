# Hey TA — Project Plan

## Problem Definition

Students working on math and science problems on paper or whiteboards have no quick way to get contextual help without breaking their workflow. Existing tools require typing problems into a computer, uploading photos manually, or switching contexts entirely. This interrupts the physical thinking process that pen-and-paper work enables.

The core insight: **the best tutoring happens in the student's workspace, not the computer's**. A teaching assistant who can *see* your work and *hear* your question — and respond in seconds — removes the friction between "I'm stuck" and "I understand."

## Vision

Hey TA is a desktop AI teaching assistant that lives as a floating overlay on macOS. It continuously observes the student's physical workspace through a webcam, listens for voice-activated help requests, and responds with both a quick spoken hint and a detailed written explanation with proper mathematical notation.

The product philosophy is **Socratic, not solutionist** — it guides students toward understanding rather than giving answers. It references the student's actual visible work ("I can see you wrote the integral as...") to make feedback concrete and actionable.

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
| Session interaction logging | Implemented | P1 |
| Interaction timeline UI | Implemented | P1 |
| Post-session recap generation | Implemented | P1 |
| Manual text input fallback | Implemented | P1 |

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

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Camera image quality too low for GPT-4o to read handwriting | Medium | High | Stability scoring selects clearest frame; user can reposition camera |
| Wake phrase false positives | Medium | Low | Conservative phrase matching; stop phrase to end capture |
| Whisper transcription errors | Low | Medium | Artifact filtering; manual text input as fallback |
| OpenAI API latency spikes | Medium | Medium | Streaming responses; spoken blurb delivered first for perceived speed |
| macOS permission dialogs confuse users | Low | Low | Clear first-launch guidance |

## Timeline

This is a v1 built in a compressed timeframe. All features listed above are implemented and the application compiles and builds successfully into a macOS `.app` and `.dmg`.
