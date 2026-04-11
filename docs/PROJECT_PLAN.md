# Hey TA — Project Plan

## Problem Definition

Students working on math and science problems on paper or whiteboards have no quick way to get contextual help without breaking their workflow. Existing tools require typing problems into a computer, uploading photos manually, or switching contexts entirely. This interrupts the physical thinking process that pen-and-paper work enables.

The core insight: **the best tutoring happens in the student's workspace, not the computer's**. A teaching assistant who can *see* your work and *hear* your question — and respond in seconds — removes the friction between "I'm stuck" and "I understand."

### User Validation

This friction is well-documented in our own experience and informal interviews. We conducted **6 informal interviews with university students** (3 STEM majors at UC-level institutions, 2 AP high school students, 1 graduate TA) plus **2 team members' first-hand experience** as daily users of paper-based problem-solving workflows. While not a formal study, this 8-person validation cohort consistently surfaced the same pain points:

- *"I lose my train of thought every time I have to unlock my phone, open ChatGPT, take a photo, type context, and wait."* — University calculus student during user interview
- *"I wish I could just talk to someone while I'm working. Typing breaks the flow."* — High school AP Physics student, informal feedback session
- *"The worst part is re-explaining what I've already written. The AI can't see my paper."* — Team member who built the original Python prototype out of personal frustration

These quotes reflect a consistent pattern: the context-switching tax of moving between physical and digital workspaces is the primary barrier, not the quality of the AI itself.

## Vision

Hey TA is a desktop AI teaching assistant that lives as a floating overlay on macOS. It continuously observes the student's physical workspace through a webcam, listens for voice-activated help requests, and responds with both a quick spoken hint and a detailed written explanation with proper mathematical notation.

The product philosophy is **Socratic, not solutionist** — it guides students toward understanding rather than giving answers. It references the student's actual visible work ("I can see you wrote the integral as...") to make feedback concrete and actionable.

### Success Criteria for v1

| Criterion | Target | Measurement Method |
|-----------|--------|--------------------|
| End-to-end latency (speech end → spoken hint) | < 10 seconds | Stopwatch timing across 20 representative queries |
| Wake phrase detection rate | > 80% true-positive rate | 50-trial test with varied accents and ambient noise levels |
| Workspace image relevance | GPT-4o references visible work in ≥ 70% of responses | Manual audit of 30 consecutive interactions |
| False-positive wake rate | < 5% of non-wake utterances trigger the pipeline | 100 non-wake speech samples during normal study conversation |
| UI focus preservation | 0 unintended focus-steal events per session | Automated test: click overlay bar 20 times, verify active app unchanged |
| Build-to-launch time | < 60 seconds on M1 MacBook Air | `time npm run tauri build` averaged over 3 runs |
| Crash-free session rate | > 95% of sessions complete without unhandled exceptions | Manual 2-hour soak test × 3 sessions |

### Future Vision (v2+)

- **Cross-platform**: Windows and Linux support via standard always-on-top windows (replacing NSPanel)
- **Model-agnostic backend**: `ModelProvider` interface already implemented — swap in Anthropic Claude, Google Gemini, or a local Ollama instance with zero UI changes
- **Collaborative study sessions**: Multiple students share a session, see each other's questions and TA responses in real time
- **LMS integration**: Export session recaps to Canvas, Blackboard, or Google Classroom as study logs
- **Handwriting preprocessing**: Lightweight local model to detect, crop, and sharpen the most relevant workspace region before sending to the vision model — reduces token cost and improves accuracy
- **Mobile companion**: iOS/Android app that connects to the desktop session for on-the-go review

## Total Addressable Market

The primary market for Hey TA spans two well-defined segments:

- **US college students**: ~20 million enrolled (NCES, 2023 Digest of Education Statistics, Table 105.30). STEM majors (~3.5M) are the highest-intent segment — these students regularly work paper-based problem sets in calculus, physics, and engineering.
- **US AP high school students**: ~4 million AP exam takers annually (College Board, AP Program Participation Report 2023), concentrated in math and science courses where paper-based practice is standard.
- **Growing ed-tech market**: The global ed-tech market is projected to reach $400B by 2028 (HolonIQ Global EdTech Market Report, 2023), with AI-powered tutoring as one of the fastest-growing sub-segments at ~25% CAGR.

Even capturing 0.1% of the ~24M combined student base represents ~24,000 potential users — more than sufficient for a v1 validation cohort and an attractive niche for a desktop-first product before expanding to broader platforms.

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

**Research basis for latency target**: Bailey & Iqbal (2008), "Understanding Changes in Mental Workload during Execution of Goal-Directed Tasks and Its Application for Interruption Management" (*ACM Transactions on Computer-Human Interaction*, 14(4)), found that interruptions exceeding 8–15 seconds cause measurable degradation in task context retention. Hey TA's sub-10-second voice-to-hint loop is designed to stay within this empirically validated window, preserving the student's working memory and flow state.

## Differentiation Strategy

Unlike existing tools, Hey TA operates *inside* the student's workflow rather than requiring them to leave it:

- **vs. ChatGPT mobile**: Hey TA eliminates the 7-step manual process (unlock → open app → tap camera → position → capture → type context → wait). The student simply speaks while continuing to write.
- **vs. Photomath / Wolfram Alpha**: These are solution engines, not tutors. Hey TA's Socratic output format (spoken hint + detailed written explanation) builds understanding rather than providing answers to copy.
- **vs. Google Lens**: Lens identifies and retrieves; Hey TA observes, understands context from prior interactions, and teaches. The rolling conversation history means follow-up questions don't require re-explaining.
- **The NSPanel advantage**: On macOS, the overlay bar uses `NSWindowStyleMaskNonActivatingPanel`, meaning clicks on the bar don't steal keyboard focus from the student's other apps (textbook PDFs, homework websites). No other AI tutoring tool preserves application focus this way.

## Adjacent Threats

These products are not direct competitors today but could move into Hey TA's niche:

| Product | Current Focus | Threat Vector | Hey TA's Defensibility |
|---------|--------------|---------------|----------------------|
| **Apple Intelligence** | On-device summarization, writing tools, Siri upgrades | Apple could add always-on camera-based tutoring natively on macOS/iPad | Hey TA ships now; Apple's education-specific features historically lag 2–3 years behind announcement. Our Socratic tutoring prompt and workspace compositor are domain-specific in ways a general assistant won't replicate without deliberate effort. |
| **Khanmigo** (Khan Academy + GPT-4) | Text-based Socratic tutor inside Khan Academy's platform | Could add voice + camera input to their existing tutor | Khanmigo is web-locked to Khan Academy content. Hey TA is content-agnostic — any textbook, any course, any handwritten work. No platform dependency. |
| **Chegg** | Homework answer database, step-by-step solutions | Could integrate vision + voice into their mobile app | Chegg's brand is "get the answer," which conflicts with Socratic guidance. Institutional pushback against Chegg (academic integrity policies) is a headwind they can't easily reverse. |
| **Otter.ai** | Meeting transcription and summarization | Could pivot to educational lecture/study transcription with tutoring | Otter has no vision model integration or tutoring pedagogy. Moving from transcription to interactive teaching is a large product pivot. |
| **Google NotebookLM** | Document-grounded Q&A with audio overview | Could add real-time camera input and voice interaction | NotebookLM requires uploading documents first; Hey TA's ambient observation is zero-setup. Google's strength is digital documents, not physical workspace observation. |

**Strategic response**: Hey TA's moat is the combination of *ambient physical workspace observation* + *zero-friction voice interaction* + *non-intrusive overlay*. Any single competitor can replicate one axis, but the integrated experience across all three — purpose-built for paper-based study — is defensible for the v1 validation window.

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
| Typed error handling (AppError enum) | Implemented | P1 |
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

### Decision Points

| Gate | Condition | Action if Triggered |
|------|-----------|-------------------|
| **Post-Phase 3 + 1h buffer** | Core voice loop (VAD → Whisper → wake phrase → GPT-4o → TTS) is not stable (>50% of test utterances fail end-to-end) | Drop session logging (P1) and recap notes (P1) from v1 scope entirely. Redirect all remaining hours to stabilizing the P0 voice→response loop. Ship P0-only. |
| **Mid-point checkpoint** | Latency exceeds 15 seconds for >30% of queries | Disable streaming written explanation; serve spoken blurb only. Investigate whether image payload size is the bottleneck (downscale webcam frames to 640px). |
| **Phase 7 entry** | Session logging causes memory pressure (>50 MB after 20 interactions) | Switch to disk-backed log immediately (`~/.heyta/sessions/`) with lazy image writes, defer timeline UI to v2. |

### Offline / Degraded Mode Contingency

For demo resilience and environments with unreliable internet:

- **Pre-recorded demo session replay**: A bundled JSON file (`assets/demo-session.json`) containing 5 representative interaction pairs (question transcript, webcam frame base64, AI response, TTS audio base64). The app can play these back in sequence with realistic timing, allowing a full product demo without any network connectivity. Activated via `Cmd+Shift+D` or a `--demo` CLI flag.
- **Local model fallback via Ollama**: The `ModelProvider` abstraction already supports swappable backends. An `OllamaProvider` can target a locally running `llava` model (vision-capable) for text+image queries and `whisper.cpp` for local transcription. Expected quality degradation: higher latency (~15–30s), less accurate handwriting interpretation, no TTS (substitute with browser `speechSynthesis`). This is a viable fallback for airplane/campus-WiFi-down scenarios, not the primary experience.

## Timeline

This is a v1 built in a compressed timeframe (~35 engineering hours across a 2-person team). All features listed above are implemented and the application compiles and builds successfully into a macOS `.app` and `.dmg`. The mid-point checkpoint after Phase 4 ensures the core voice→model→TTS loop is verified before investing in higher-level features.
